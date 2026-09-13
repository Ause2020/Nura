"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { NC_ORIGIN_CREATE_OPTIONS, SEVERITY_OPTIONS } from "@/lib/capa/constants";
import { shouldQuarantineLot } from "@/lib/capa/quarantine";
import { computeCapaSignatureHash } from "@/lib/capa/workflow";
import { getSuggestedDueDate } from "@/lib/capa/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { NcOrigin, NcSeverity } from "@/types/database";

interface CreateNcFormProps {
  organizationId: string;
  userId: string;
  initialNcNumber: string;
}

export function CreateNcForm({
  organizationId,
  userId,
  initialNcNumber,
}: CreateNcFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ncNumber, setNcNumber] = useState(initialNcNumber);
  const [origin, setOrigin] = useState<NcOrigin>("other");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<NcSeverity>("major");
  const [productAffected, setProductAffected] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [area, setArea] = useState("");
  const [dueDate, setDueDate] = useState(getSuggestedDueDate("major"));

  useEffect(() => {
    setDueDate(getSuggestedDueDate(severity));
  }, [severity]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("La descripción es requerida");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();

    const lotQuarantined = shouldQuarantineLot(severity, "major", lotNumber.trim());

    const { data, error: insertError } = await supabase
      .from("nonconformities")
      .insert({
        organization_id: organizationId,
        nc_number: ncNumber.trim(),
        origin,
        description: description.trim(),
        severity,
        product_affected: productAffected.trim() || null,
        lot_number: lotNumber.trim() || null,
        area: area.trim() || null,
        detected_by: userId,
        assigned_to: userId,
        due_date: dueDate,
        capa_target_close_date: dueDate,
        status: "open",
        capa_stage: "identification",
        effectiveness_result: "pending",
        lot_quarantined: lotQuarantined,
      })
      .select("id")
      .single();

    if (insertError || !data) {
      setError("No pudimos registrar la no conformidad");
      setLoading(false);
      return;
    }

    const ncId = (data as { id: string }).id;
    const now = new Date().toISOString();
    const signatureHash = await computeCapaSignatureHash({
      userId,
      ncId,
      fromStage: null,
      toStage: "identification",
      timestamp: now,
    });

    await supabase.from("capa_stage_log").insert({
      organization_id: organizationId,
      nc_id: ncId,
      from_stage: null,
      to_stage: "identification",
      changed_by: userId,
      comment: "NC registrada manualmente",
      signature_hash: signatureHash,
    });
    const { notifyOrgManagers } = await import("@/lib/notifications");
    await notifyOrgManagers(supabase, organizationId, {
      type: "nc_new",
      title: "Nueva no conformidad",
      message: `${ncNumber}: ${description.trim().slice(0, 80)}`,
      link: `/capa/${ncId}`,
      dedupKey: `nc-new-${ncId}`,
    });

    setLoading(false);
    router.push(`/capa/${ncId}`);
    router.refresh();
  }

  return (
    <>
      <ModuleHeader
        title="Nueva no conformidad"
        description="Registro manual de NC"
        actions={
          <Link href="/capa">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />
      <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5 max-w-2xl">
        <Input
          label="N° NC"
          value={ncNumber}
          onChange={(e) => setNcNumber(e.target.value)}
          className="font-mono"
          required
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Origen
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {NC_ORIGIN_CREATE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setOrigin(value)}
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-md border text-xs text-left transition-colors duration-150",
                  origin === value
                    ? "border-forest bg-sage-light text-forest"
                    : "border-border hover:bg-background"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label="Descripción detallada"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe la desviación encontrada..."
          required
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Severidad
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={cn(
                  "p-3 rounded-md border text-left transition-colors duration-150",
                  severity === s.value
                    ? "border-forest bg-sage-light"
                    : "border-border hover:bg-background"
                )}
              >
                <p className="text-sm font-medium text-ink">{s.label}</p>
                <p className="text-xs text-ink-faint mt-0.5">{s.description}</p>
                <p className="text-xs font-mono text-ink-light mt-1">
                  Plazo sugerido: {s.days} días
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Input
            label="Producto afectado"
            value={productAffected}
            onChange={(e) => setProductAffected(e.target.value)}
            placeholder="Opcional"
          />
          <Input
            label="N° de lote"
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            placeholder="Opcional"
            className="font-mono"
          />
        </div>

        <Input
          label="Área donde ocurrió"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="ej. Línea de empaque"
        />

        <Input
          label="Fecha límite para resolución"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />

        {shouldQuarantineLot(severity, "major", lotNumber.trim()) && (
          <p className="text-xs text-danger flex items-center gap-1.5">
            Al registrar, el lote quedará marcado en cuarentena (severidad ≥ mayor).
          </p>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-2">
          <Link href="/capa">
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" loading={loading}>
            Registrar NC
          </Button>
        </div>
      </form>
    </>
  );
}
