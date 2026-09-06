"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CHECKLIST_OPTIONS } from "@/lib/production-records/constants";
import { submitProductionRecord } from "@/lib/production-records/submit";
import {
  buildTemplateSnapshot,
  computeOperatorSignatureHash,
  isChecklistDeviation,
  isNumberOutOfRange,
  parseFieldOptions,
  type FieldValuePayload,
} from "@/lib/production-records/utils";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

interface TemplateBundle {
  template: ProductionFormTemplate;
  sections: ProductionFormSection[];
  fields: ProductionFormField[];
}

interface DigitalizarViewProps {
  bundles: TemplateBundle[];
  organizationId: string;
  userId: string;
  aiReady: boolean;
}

export function DigitalizarView({
  bundles,
  organizationId,
  userId,
  aiReady,
}: DigitalizarViewProps) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(bundles[0]?.template.id ?? "");
  const bundle = useMemo(
    () => bundles.find((b) => b.template.id === templateId) ?? bundles[0],
    [bundles, templateId]
  );
  const [preview, setPreview] = useState<string>("");
  const [mediaType, setMediaType] = useState<"image/jpeg" | "image/png" | "image/webp">(
    "image/jpeg"
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [lotNumber, setLotNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function onFile(file: File) {
    const type =
      file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    setMediaType(type);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function extract() {
    if (!preview || !bundle) return;
    setReading(true);
    setError("");
    const res = await fetch("/api/monitoreo/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: preview,
        mediaType,
        templateName: bundle.template.name,
        fields: bundle.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.field_type,
          unit: f.unit,
        })),
      }),
    });
    const body = (await res.json()) as {
      error?: string;
      lotNumber?: string | null;
      notes?: string | null;
      fields?: { fieldId: string; value: string }[];
    };
    setReading(false);
    if (!res.ok) {
      setError(body.error ?? "No se pudo leer la planilla");
      return;
    }
    const next: Record<string, string> = {};
    for (const field of body.fields ?? []) {
      next[field.fieldId] = field.value;
    }
    setValues(next);
    if (body.lotNumber) setLotNumber(body.lotNumber);
    if (body.notes) setNotes(body.notes);
  }

  async function confirm() {
    if (!bundle) return;
    setSaving(true);
    setError("");
    const snapshot = buildTemplateSnapshot(
      bundle.template,
      bundle.sections,
      bundle.fields
    );
    const payload: FieldValuePayload[] = bundle.fields
      .filter((f) => f.field_type !== "photo")
      .map((field) => {
        const raw = values[field.id] ?? "";
        if (field.field_type === "number") {
          const num = raw === "" ? null : Number(raw);
          return {
            field_id: field.id,
            field_label: field.label,
            field_type: field.field_type,
            value_number: Number.isFinite(num) ? num : null,
            is_out_of_range:
              num != null &&
              Number.isFinite(num) &&
              isNumberOutOfRange(num, field.min_value, field.max_value),
          };
        }
        return {
          field_id: field.id,
          field_label: field.label,
          field_type: field.field_type,
          value_text: raw || null,
          is_out_of_range: isChecklistDeviation(raw),
        };
      });

    const submittedAt = new Date().toISOString();
    const clientSubmissionId = crypto.randomUUID();
    const signature = await computeOperatorSignatureHash({
      userId,
      templateId: bundle.template.id,
      submissionId: clientSubmissionId,
      timestamp: submittedAt,
    });

    try {
      await submitProductionRecord(createClient(), {
        organizationId,
        userId,
        templateId: bundle.template.id,
        templateSnapshot: snapshot,
        area: bundle.template.area,
        lotNumber: lotNumber || null,
        deviationNotes: notes || null,
        values: payload,
        operatorSignatureHash: signature,
        operatorSignedAt: submittedAt,
        submittedAt,
        clientSubmissionId,
        source: "ocr",
        monitorName: "Digitalizado",
      });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (bundles.length === 0) {
    return (
      <p className="px-6 py-8 text-sm text-ink-light">
        Crea una plantilla activa antes de digitalizar planillas de papel.
      </p>
    );
  }

  if (done) {
    return (
      <div className="px-6 py-10 max-w-lg">
        <div className="bg-white border border-border rounded-md p-6 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-sage mx-auto" />
          <p className="text-sm font-semibold text-ink">Listo en el histórico</p>
          <p className="text-xs text-ink-light">
            Revisa el registro y corrige si el OCR interpretó mal un valor.
          </p>
          <Button type="button" onClick={() => router.push("/registros/historico")}>
            Ver histórico
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-5 max-w-5xl">
      {!aiReady && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-ink">
          Falta <code className="font-mono">ANTHROPIC_API_KEY</code> para leer
          planillas. Puedes cargar la foto y completar los campos a mano.
        </div>
      )}

      <section className="bg-white border border-border rounded-md p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Planilla de papel</h2>
          <p className="text-xs text-ink-faint mt-1">
            Elige la plantilla equivalente, sube el escaneo o la foto, revisa
            los valores y confirma. Nada entra al histórico sin tu visto bueno.
          </p>
        </div>
        <label className="text-xs text-ink-light space-y-1 block">
          <span>Plantilla destino</span>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setValues({});
            }}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {bundles.map((b) => (
              <option key={b.template.id} value={b.template.id}>
                {b.template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-md p-6 cursor-pointer hover:bg-background">
          <Camera className="h-6 w-6 text-forest" />
          <span className="text-sm text-ink-light">
            Foto o escaneo de la planilla
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>

        {preview && (
          <img
            src={preview}
            alt="Planilla a digitalizar"
            className="max-h-64 rounded-md border border-border mx-auto"
          />
        )}

        <Button
          type="button"
          onClick={() => void extract()}
          disabled={!preview || !aiReady}
          loading={reading}
        >
          Extraer datos
        </Button>
      </section>

      {bundle && (
        <section className="bg-white border border-border rounded-md p-5 space-y-4">
          <h2 className="text-sm font-semibold text-ink">Revisar y confirmar</h2>
          <label className="text-xs text-ink-light space-y-1 block">
            <span>Lote</span>
            <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </label>
          {bundle.fields
            .filter((f) => f.field_type !== "photo")
            .map((field) => {
              const value = values[field.id] ?? "";
              return (
                <label key={field.id} className="text-xs text-ink-light space-y-1 block">
                  <span>
                    {field.label}
                    {field.unit ? ` (${field.unit})` : ""}
                  </span>
                  {field.field_type === "select" ? (
                    <select
                      value={value}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                      className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                    >
                      <option value="">—</option>
                      {parseFieldOptions(field.options).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.field_type === "checklist" ? (
                    <div className="flex gap-2">
                      {CHECKLIST_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setValues((prev) => ({ ...prev, [field.id]: opt.value }))
                          }
                          className={cn(
                            "flex-1 h-9 text-sm rounded-md border",
                            value === opt.value
                              ? "border-forest bg-sage-light text-forest"
                              : "border-border bg-white"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={field.field_type === "number" ? "number" : "text"}
                      value={value}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                    />
                  )}
                </label>
              );
            })}
          <label className="text-xs text-ink-light space-y-1 block">
            <span>Observaciones</span>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="button" onClick={() => void confirm()} loading={saving}>
            Confirmar al histórico
          </Button>
        </section>
      )}
    </div>
  );
}
