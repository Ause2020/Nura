"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2 } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CHECKLIST_OPTIONS, PHOTOS_BUCKET } from "@/lib/production-records/constants";
import {
  getPendingSubmissions,
  isOnline,
  queuePendingSubmission,
  removePendingSubmission,
} from "@/lib/production-records/offline";
import { submitProductionRecord } from "@/lib/production-records/submit";
import {
  buildTemplateSnapshot,
  computeOperatorSignatureHash,
  isChecklistDeviation,
  isNumberOutOfRange,
  parseFieldOptions,
  type FieldValuePayload,
} from "@/lib/production-records/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

type FieldState = Record<
  string,
  {
    text?: string;
    number?: string;
    json?: unknown;
    outOfRange?: boolean;
  }
>;

interface ProductionFormExecutorProps {
  template: ProductionFormTemplate;
  sections: ProductionFormSection[];
  fields: ProductionFormField[];
  organizationId: string;
  userId: string;
}

export function ProductionFormExecutor({
  template,
  sections,
  fields,
  organizationId,
  userId,
}: ProductionFormExecutorProps) {
  const router = useRouter();
  const snapshot = useMemo(
    () => buildTemplateSnapshot(template, sections, fields),
    [template, sections, fields]
  );

  const [values, setValues] = useState<FieldState>({});
  const [lotNumber, setLotNumber] = useState("");
  const [deviationNotes, setDeviationNotes] = useState("");
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [resultNcId, setResultNcId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const hasDeviation = useMemo(() => {
    for (const field of fields) {
      const state = values[field.id];
      if (field.field_type === "number" && state?.outOfRange) return true;
      if (field.field_type === "checklist" && isChecklistDeviation(state?.text)) {
        return true;
      }
    }
    return false;
  }, [fields, values]);

  const syncPending = useCallback(async () => {
    if (!isOnline()) return;
    const pending = getPendingSubmissions().filter(
      (p) => p.organizationId === organizationId
    );
    if (pending.length === 0) return;

    setSyncing(true);
    const supabase = createClient();

    for (const item of pending) {
      try {
        await submitProductionRecord(supabase, {
          organizationId: item.organizationId,
          userId,
          templateId: item.templateId,
          templateSnapshot: item.payload.templateSnapshot as ReturnType<
            typeof buildTemplateSnapshot
          >,
          area: item.payload.area,
          lotNumber: item.payload.lotNumber,
          deviationNotes: item.payload.deviationNotes,
          values: item.payload.values as FieldValuePayload[],
          operatorSignatureHash: item.payload.operatorSignatureHash,
          operatorSignedAt: item.payload.operatorSignedAt,
          submittedAt: item.payload.submittedAt,
          clientSubmissionId: item.clientSubmissionId,
          syncStatus: "synced",
        });
        removePendingSubmission(item.clientSubmissionId);
      } catch {
        // keep in queue
      }
    }

    setSyncing(false);
    router.refresh();
  }, [organizationId, userId, router]);

  useEffect(() => {
    void syncPending();
    const onOnline = () => void syncPending();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncPending]);

  async function uploadPhoto(fieldId: string, file: File) {
    const supabase = createClient();
    const path = `${organizationId}/${template.id}/${fieldId}-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    setValues((prev) => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], text: data.publicUrl },
    }));
  }

  function buildValuePayloads(): FieldValuePayload[] {
    return fields
      .filter((field) => {
        const state = values[field.id];
        return state?.text || state?.number || state?.json;
      })
      .map((field) => {
        const state = values[field.id] ?? {};
        const payload: FieldValuePayload = {
          field_id: field.id,
          field_label: field.label,
          field_type: field.field_type,
          is_out_of_range: Boolean(state.outOfRange),
        };

        if (field.field_type === "number") {
          payload.value_number = state.number ? Number(state.number) : null;
        } else if (field.field_type === "multiselect") {
          payload.value_json = state.json ?? [];
        } else {
          payload.value_text = state.text ?? null;
        }

        return payload;
      });
  }

  function validateRequired(): string | null {
    for (const field of fields) {
      if (!field.required) continue;
      const state = values[field.id];
      if (field.field_type === "number" && !state?.number?.trim()) {
        return `Completa: ${field.label}`;
      }
      if (field.field_type === "multiselect") {
        const arr = state?.json as string[] | undefined;
        if (!arr?.length) return `Completa: ${field.label}`;
      }
      if (field.field_type === "photo" && !state?.text) {
        return `Adjunta foto: ${field.label}`;
      }
      if (
        field.field_type !== "number" &&
        field.field_type !== "multiselect" &&
        field.field_type !== "photo" &&
        !state?.text?.trim()
      ) {
        return `Completa: ${field.label}`;
      }
    }

    if (hasDeviation && !deviationNotes.trim()) {
      return "Describe la acción o comentario por la desviación detectada";
    }

    if (!signed) {
      return "Confirma con tu firma digital antes de enviar";
    }

    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const validationError = validateRequired();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const now = new Date().toISOString();
    const clientSubmissionId = crypto.randomUUID();
    const valuePayloads = buildValuePayloads();

    const signatureHash = await computeOperatorSignatureHash({
      userId,
      templateId: template.id,
      submissionId: clientSubmissionId,
      timestamp: now,
    });

    const input = {
      organizationId,
      userId,
      templateId: template.id,
      templateSnapshot: snapshot,
      area: template.area,
      lotNumber: lotNumber.trim() || null,
      deviationNotes: deviationNotes.trim() || null,
      values: valuePayloads,
      operatorSignatureHash: signatureHash,
      operatorSignedAt: now,
      submittedAt: now,
      clientSubmissionId,
    };

    if (!isOnline()) {
      queuePendingSubmission({
        clientSubmissionId,
        organizationId,
        templateId: template.id,
        payload: {
          area: template.area,
          lotNumber: lotNumber.trim() || null,
          deviationNotes: deviationNotes.trim() || null,
          values: valuePayloads,
          templateSnapshot: snapshot,
          operatorSignatureHash: signatureHash,
          operatorSignedAt: now,
          submittedAt: now,
        },
        queuedAt: now,
      });
      setDone(true);
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const result = await submitProductionRecord(supabase, input);
      setResultNcId(result.ncId);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sage-light">
          <CheckCircle2 className="h-7 w-7 text-sage" />
        </div>
        <h2 className="text-sm font-semibold text-ink">Registro guardado</h2>
        <p className="text-xs text-ink-faint">
          {!isOnline()
            ? "Quedó en cola local. Se sincronizará al recuperar conexión."
            : resultNcId
              ? "Se generó un borrador de No Conformidad por la desviación."
              : "El registro quedó conforme."}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Link href="/registros">
            <Button type="button">Ver historial</Button>
          </Link>
          {resultNcId && (
            <Link href={`/capa/${resultNcId}`}>
              <Button type="button" variant="secondary">
                Ver NC
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      <ModuleHeader
        title={template.name}
        description={template.area ?? "Registro en planta"}
        actions={
          <Link href="/registros/plantillas">
            <Button type="button" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      {syncing && (
        <p className="text-xs text-ink-faint mb-3">Sincronizando registros pendientes…</p>
      )}

      {!isOnline() && (
        <div className="mb-4 px-3 py-2 rounded-md border border-amber/30 bg-amber/5 text-xs text-amber">
          Sin conexión. El registro se guardará localmente y se sincronizará después.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 mt-4">
        <Input
          label="Lote (opcional)"
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
          placeholder="LOT-2026-001"
        />

        {snapshot.sections.map((section) => (
          <div
            key={section.id}
            className="bg-white border border-border rounded-md p-4 space-y-4"
          >
            <h3 className="text-sm font-semibold text-ink">{section.title}</h3>

            {section.fields.map((field) => {
              const state = values[field.id] ?? {};
              const options = parseFieldOptions(field.options);

              return (
                <div key={field.id} className="space-y-1">
                  <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                    {field.label}
                    {field.required && (
                      <span className="text-danger ml-0.5">*</span>
                    )}
                  </p>

                  {field.field_type === "text" && (
                    <Input
                      value={state.text ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.id]: { text: e.target.value },
                        }))
                      }
                    />
                  )}

                  {field.field_type === "number" && (
                    <div className="space-y-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={state.number ?? ""}
                        onChange={(e) => {
                          const num = e.target.value;
                          const parsed = num ? Number(num) : null;
                          const outOfRange =
                            parsed != null &&
                            !Number.isNaN(parsed) &&
                            isNumberOutOfRange(
                              parsed,
                              field.min_value,
                              field.max_value
                            );
                          setValues((prev) => ({
                            ...prev,
                            [field.id]: { number: num, outOfRange },
                          }));
                        }}
                      />
                      {field.unit && (
                        <p className="text-xs text-ink-faint">{field.unit}</p>
                      )}
                      {state.outOfRange && (
                        <div className="flex items-center gap-1.5 text-xs text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Valor fuera de rango
                          {field.min_value != null || field.max_value != null
                            ? ` (${field.min_value ?? "—"} – ${field.max_value ?? "—"})`
                            : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {field.field_type === "datetime" && (
                    <Input
                      type="datetime-local"
                      value={state.text ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.id]: { text: e.target.value },
                        }))
                      }
                    />
                  )}

                  {field.field_type === "select" && (
                    <select
                      value={state.text ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.id]: { text: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 text-sm border border-border rounded-md bg-white"
                    >
                      <option value="">Seleccionar</option>
                      {options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.field_type === "multiselect" && (
                    <div className="flex flex-wrap gap-2">
                      {options.map((opt) => {
                        const selected = (
                          (state.json as string[] | undefined) ?? []
                        ).includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setValues((prev) => {
                                const current = [
                                  ...(((prev[field.id]?.json as string[]) ??
                                    []) as string[]),
                                ];
                                const next = selected
                                  ? current.filter((v) => v !== opt)
                                  : [...current, opt];
                                return {
                                  ...prev,
                                  [field.id]: { json: next },
                                };
                              })
                            }
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs border",
                              selected
                                ? "bg-sage-light text-forest border-sage/30"
                                : "bg-white border-border"
                            )}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {field.field_type === "checklist" && (
                    <div className="grid grid-cols-3 gap-2">
                      {CHECKLIST_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setValues((prev) => ({
                              ...prev,
                              [field.id]: { text: opt.value },
                            }))
                          }
                          className={cn(
                            "h-10 rounded-md border text-sm font-medium",
                            state.text === opt.value
                              ? opt.value === "no"
                                ? "border-danger bg-red-50 text-danger"
                                : "border-forest bg-sage-light text-forest"
                              : "border-border bg-white"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {field.field_type === "photo" && (
                    <div className="space-y-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm cursor-pointer bg-white">
                        <Camera className="h-4 w-4" />
                        Tomar / subir foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadPhoto(field.id, file);
                          }}
                        />
                      </label>
                      {state.text && (
                        <img
                          src={state.text}
                          alt={field.label}
                          className="rounded-md max-h-40 object-cover border border-border"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {hasDeviation && (
          <div className="bg-red-50 border border-danger/20 rounded-md p-4 space-y-2">
            <div className="flex items-center gap-2 text-danger text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Desviación detectada
            </div>
            <Textarea
              label="Acción / comentario obligatorio"
              value={deviationNotes}
              onChange={(e) => setDeviationNotes(e.target.value)}
              className="min-h-[80px]"
              required
            />
          </div>
        )}

        <div className="bg-white border border-border rounded-md p-4 space-y-3">
          <label className="flex items-start gap-3 text-sm text-ink-light">
            <input
              type="checkbox"
              checked={signed}
              onChange={(e) => setSigned(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Confirmo que los datos registrados son correctos y firmo digitalmente
              este formulario como operador responsable.
            </span>
          </label>
          {signed && (
            <Badge variant="success">Firma pendiente de envío</Badge>
          )}
        </div>

        {error && (
          <p className="text-xs text-danger text-center" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-11" loading={loading}>
          Finalizar registro
        </Button>
      </form>
    </div>
  );
}
