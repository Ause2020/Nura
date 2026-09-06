"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Sparkles } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  COMPLAINT_CHANNELS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_TYPES,
} from "@/lib/complaints/constants";
import { detectRecurrence } from "@/lib/complaints/utils";
import { computeResponseDueAt, parseSlaHours } from "@/lib/complaints/sla";
import { logComplaintStatusChange } from "@/lib/complaints/status-log";
import { autoCreateNcFromComplaintIfNeeded } from "@/lib/integrations/auto-nc-from-complaint";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  ComplaintChannel,
  ComplaintSeverity,
  ComplaintType,
  CustomerComplaint,
  HaccpProduct,
} from "@/types/database";

interface NewComplaintFormProps {
  organizationId: string;
  userId: string;
  products: HaccpProduct[];
  initialNumber: string;
  existingComplaints: CustomerComplaint[];
  slaHours: number;
  autoNcThreshold: unknown;
  aiAvailable?: boolean;
}

export function NewComplaintForm({
  organizationId,
  userId,
  products,
  initialNumber,
  existingComplaints,
  slaHours,
  autoNcThreshold,
  aiAvailable = false,
}: NewComplaintFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complaintNumber, setComplaintNumber] = useState(initialNumber);
  const [severity, setSeverity] = useState<ComplaintSeverity>("quality");
  const [complaintType, setComplaintType] = useState<ComplaintType>("other");
  const [productReturned, setProductReturned] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggested, setAiSuggested] = useState(false);

  async function handleClassify() {
    if (!description.trim()) {
      setAiError("Escribe la descripción del reclamo primero");
      return;
    }
    setClassifying(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai/complaint-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const json = await res.json() as {
        type?: ComplaintType;
        severity?: ComplaintSeverity;
        error?: string;
      };
      if (!res.ok) {
        setAiError(json.error ?? "Error de IA");
        return;
      }
      if (json.type) setComplaintType(json.type);
      if (json.severity) setSeverity(json.severity);
      setAiSuggested(true);
    } catch {
      setAiError("No se pudo conectar con la IA");
    } finally {
      setClassifying(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const productId = String(form.get("product_id")) || null;
    // complaint_type and severity come from controlled state (supports AI pre-fill)
    const receivedDate = String(form.get("received_date"));

    if (!description) {
      setError("La descripción es requerida");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const productName =
      products.find((p) => p.id === productId)?.name ?? null;
    const responseDueAt = computeResponseDueAt(
      receivedDate,
      parseSlaHours(slaHours)
    );
    const isRecurrent = detectRecurrence(
      {
        complaint_type: complaintType,
        product_id: productId,
        received_date: receivedDate,
      },
      existingComplaints
    );

    const { data, error: insertError } = await supabase
      .from("customer_complaints")
      .insert({
        organization_id: organizationId,
        complaint_number: complaintNumber.trim(),
        received_date: receivedDate,
        channel: form.get("channel") as ComplaintChannel,
        customer_name: String(form.get("customer_name")).trim(),
        customer_contact: String(form.get("customer_contact")).trim() || null,
        product_id: productId,
        lot_number: String(form.get("lot_number")).trim() || null,
        complaint_type: complaintType,
        severity,
        description,
        quantity_affected: form.get("quantity_affected")
          ? Number(form.get("quantity_affected"))
          : null,
        product_returned: productReturned,
        status: "open",
        recurrence: isRecurrent,
        response_due_at: responseDueAt,
        response_responsible: userId,
      })
      .select("id")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Error al registrar reclamo");
      setLoading(false);
      return;
    }

    const complaintId = (data as { id: string }).id;

    await logComplaintStatusChange(supabase, {
      complaintId,
      organizationId,
      fromStatus: null,
      toStatus: "open",
      changedBy: userId,
      comment: "Registro inicial",
    });

    await autoCreateNcFromComplaintIfNeeded(supabase, {
      organizationId,
      userId,
      complaintId,
      complaintNumber: complaintNumber.trim(),
      description,
      severity,
      lotNumber: String(form.get("lot_number")).trim() || null,
      productName,
      autoNcThreshold,
    });

    for (const file of photos) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${organizationId}/${complaintId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("complaint-photos")
        .upload(path, file, { upsert: true });

      if (uploadError) continue;

      const { data: urlData } = supabase.storage
        .from("complaint-photos")
        .getPublicUrl(path);

      await supabase.from("complaint_photos").insert({
        complaint_id: complaintId,
        organization_id: organizationId,
        photo_url: urlData.publicUrl,
        description: file.name,
      });
    }

    if (isRecurrent) {
      const { notifyOrgManagers } = await import("@/lib/notifications");
      await notifyOrgManagers(supabase, organizationId, {
        type: "system",
        title: "Reclamo recurrente detectado",
        message: `${complaintNumber}: mismo tipo y producto en los últimos 90 días`,
        link: `/reclamos/${complaintId}`,
        dedupKey: `complaint-recurrence-${complaintId}`,
      });
    }

    if (severity === "safety_critical") {
      const { notifyOrgManagers } = await import("@/lib/notifications");
      await notifyOrgManagers(supabase, organizationId, {
        type: "complaint_critical",
        title: "Reclamo crítico de inocuidad",
        message: `${complaintNumber}: ${description.slice(0, 80)}`,
        link: `/reclamos/${complaintId}`,
        dedupKey: `complaint-critical-${complaintId}`,
      });

      await fetch("/api/notifications/complaint-critical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId }),
      });
    }

    setLoading(false);
    router.push(`/reclamos/${complaintId}`);
    router.refresh();
  }

  return (
    <>
      <ModuleHeader
        title="Nuevo reclamo"
        description="Registro y seguimiento al cliente"
        actions={
          <Link href="/reclamos">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="px-6 py-4 max-w-2xl space-y-4">
        {severity === "safety_critical" && (
          <div className="flex gap-2 items-start text-xs text-danger bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Reclamo de seguridad crítica: se notificará inmediatamente al
              jefe de calidad por app y email.
            </p>
          </div>
        )}

        <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
          <Input
            label="N° reclamo"
            value={complaintNumber}
            onChange={(e) => setComplaintNumber(e.target.value)}
            className="font-mono"
            required
          />

          <div className="grid md:grid-cols-2 gap-3">
            <Input
              name="received_date"
              label="Fecha de recepción"
              type="date"
              defaultValue={new Date().toISOString().split("T")[0]}
              required
            />
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                Canal
              </label>
              <select
                name="channel"
                required
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                {COMPLAINT_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Input name="customer_name" label="Cliente" required />
            <Input name="customer_contact" label="Contacto" />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                Producto
              </label>
              <select
                name="product_id"
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                <option value="">Sin especificar</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Input name="lot_number" label="N° de lote" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Tipo de reclamo
            </label>
            <select
              name="complaint_type"
              value={complaintType}
              onChange={(e) => setComplaintType(e.target.value as ComplaintType)}
              required
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              {COMPLAINT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.description}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Severidad
            </p>
            <div className="grid md:grid-cols-2 gap-2">
              {COMPLAINT_SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={cn(
                    "text-left p-3 rounded-md border text-sm transition-colors",
                    severity === s.value
                      ? "border-forest bg-sage-light"
                      : "border-border hover:bg-background"
                  )}
                >
                  <span className="font-medium text-ink">{s.label}</span>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {s.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <Textarea
            name="description"
            label="Descripción"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (aiSuggested) setAiSuggested(false);
            }}
            required
          />

          {/* AI classify button */}
          {aiAvailable && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                loading={classifying}
                onClick={handleClassify}
                className="h-8 text-xs gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Clasificar con IA
              </Button>
              {aiSuggested && (
                <span className="text-xs text-sage">
                  Tipo y severidad sugeridos · Revisa antes de guardar
                </span>
              )}
              {aiError && (
                <span className="text-xs text-danger">{aiError}</span>
              )}
            </div>
          )}
          <Input
            name="quantity_affected"
            label="Cantidad afectada"
            type="number"
            min={0}
            step="any"
          />

          <label className="flex items-center gap-2 text-sm text-ink-light">
            <input
              type="checkbox"
              checked={productReturned}
              onChange={(e) => setProductReturned(e.target.checked)}
              className="accent-forest"
            />
            El cliente devuelve el producto
          </label>

          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Fotos (opcional)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
              className="w-full text-sm"
            />
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" loading={loading}>
          Registrar reclamo
        </Button>
      </form>
    </>
  );
}
