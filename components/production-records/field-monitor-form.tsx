"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CHECKLIST_OPTIONS } from "@/lib/production-records/constants";
import {
  buildTemplateSnapshot,
  formatFieldLimits,
  isChecklistDeviation,
  isNumberOutOfRange,
  parseFieldOptions,
  type FieldValuePayload,
} from "@/lib/production-records/utils";
import { cn } from "@/lib/utils";
import type {
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

interface FieldMonitorFormProps {
  token: string;
  template: ProductionFormTemplate;
  sections: ProductionFormSection[];
  fields: ProductionFormField[];
  organizationName: string;
  label: string;
}

export function FieldMonitorForm({
  token,
  template,
  sections,
  fields,
  organizationName,
  label,
}: FieldMonitorFormProps) {
  const snapshot = useMemo(
    () => buildTemplateSnapshot(template, sections, fields),
    [template, sections, fields]
  );
  const [monitorName, setMonitorName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function setField(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function toggleMulti(id: string, option: string) {
    setMultiValues((prev) => {
      const current = prev[id] ?? [];
      return {
        ...prev,
        [id]: current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option],
      };
    });
  }

  function buildPayload(): FieldValuePayload[] {
    return fields
      .filter((f) => f.field_type !== "photo")
      .map((field) => {
        if (field.field_type === "number") {
          const raw = values[field.id] ?? "";
          const num = raw === "" ? null : Number(raw);
          return {
            field_id: field.id,
            field_label: field.label,
            field_type: field.field_type,
            value_number: num,
            is_out_of_range:
              num != null && isNumberOutOfRange(num, field.min_value, field.max_value),
          };
        }
        if (field.field_type === "multiselect") {
          const selected = multiValues[field.id] ?? [];
          return {
            field_id: field.id,
            field_label: field.label,
            field_type: field.field_type,
            value_json: selected,
            value_text: selected.join(", ") || null,
            is_out_of_range: false,
          };
        }
        const raw = values[field.id] ?? "";
        return {
          field_id: field.id,
          field_label: field.label,
          field_type: field.field_type,
          value_text: raw || null,
          is_out_of_range: isChecklistDeviation(raw),
        };
      });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!monitorName.trim()) {
      setError("Indica tu nombre para firmar el registro.");
      return;
    }
    const missing = fields.filter((f) => {
      if (!f.required || f.field_type === "photo") return false;
      if (f.field_type === "multiselect") {
        return (multiValues[f.id] ?? []).length === 0;
      }
      return !(values[f.id] ?? "").trim();
    });
    if (missing.length > 0) {
      setError(`Falta completar: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setLoading(true);
    setError("");
    const res = await fetch("/api/monitoreo/qr-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        monitorName: monitorName.trim(),
        lotNumber: lotNumber.trim() || null,
        deviationNotes: notes.trim() || null,
        values: buildPayload(),
        templateSnapshot: snapshot,
      }),
    });
    setLoading(false);
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "No se pudo guardar");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white border border-border rounded-md p-6 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-sage mx-auto" />
          <h1 className="font-display text-lg font-semibold text-ink">
            Registro enviado
          </h1>
          <p className="text-sm text-ink-light">
            Quedó en el histórico de {organizationName}. Puedes cerrar esta
            pantalla.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-forest text-white px-4 py-4">
        <p className="text-[10px] uppercase tracking-wider font-mono text-white/60">
          Nura · {organizationName}
        </p>
        <h1 className="font-display text-lg font-semibold mt-0.5">
          {template.name}
        </h1>
        {(label || template.area) && (
          <p className="text-xs text-white/70 mt-1">
            {[label, template.area].filter(Boolean).join(" · ")}
          </p>
        )}
        {template.description && (
          <p className="text-xs text-white/65 mt-2 leading-relaxed">
            {template.description}
          </p>
        )}
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="max-w-md mx-auto px-4 py-5 space-y-5">
        <label className="block text-xs text-ink-light space-y-1">
          <span>Tu nombre *</span>
          <Input
            value={monitorName}
            onChange={(e) => setMonitorName(e.target.value)}
            placeholder="Monitor de calidad"
            required
          />
        </label>
        <label className="block text-xs text-ink-light space-y-1">
          <span>Lote</span>
          <Input
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            placeholder="Opcional"
          />
        </label>

        {snapshot.sections.map((section) => (
          <fieldset key={section.id} className="space-y-3">
            <legend className="text-xs font-mono uppercase tracking-wider text-ink-faint">
              {section.title}
            </legend>
            {section.fields
              .filter((f) => f.field_type !== "photo")
              .map((field) => {
                const value = values[field.id] ?? "";
                const options = parseFieldOptions(field.options);
                const limits = formatFieldLimits(field);
                const selectedMulti = multiValues[field.id] ?? [];
                const numberOut =
                  field.field_type === "number" &&
                  value !== "" &&
                  isNumberOutOfRange(Number(value), field.min_value, field.max_value);
                return (
                  <div key={field.id} className="block text-xs text-ink-light space-y-1.5">
                    <p className="font-medium text-ink">
                      {field.label}
                      {field.required ? " *" : ""}
                    </p>
                    {limits && (
                      <p className="text-[11px] text-ink-faint">{limits}</p>
                    )}
                    {field.field_type === "select" && options.length > 0 && (
                      <p className="text-[11px] text-ink-faint">
                        Opciones: {options.join(" · ")}
                      </p>
                    )}
                    {field.field_type === "multiselect" && options.length > 0 && (
                      <p className="text-[11px] text-ink-faint">
                        Puedes marcar varias: {options.join(" · ")}
                      </p>
                    )}
                    {field.field_type === "number" ? (
                      <Input
                        type="number"
                        step="any"
                        value={value}
                        onChange={(e) => setField(field.id, e.target.value)}
                        className={cn(numberOut && "border-danger")}
                      />
                    ) : field.field_type === "select" ? (
                      <div className="grid grid-cols-1 gap-2">
                        {options.length === 0 ? (
                          <p className="text-[11px] text-amber">
                            Esta pregunta no tiene opciones configuradas.
                          </p>
                        ) : (
                          options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setField(field.id, opt)}
                              className={cn(
                                "min-h-9 px-3 text-sm rounded-md border text-left",
                                value === opt
                                  ? "border-forest bg-sage-light text-forest font-medium"
                                  : "border-border bg-white text-ink"
                              )}
                            >
                              {opt}
                            </button>
                          ))
                        )}
                      </div>
                    ) : field.field_type === "multiselect" ? (
                      <div className="flex flex-wrap gap-2">
                        {options.length === 0 ? (
                          <p className="text-[11px] text-amber">
                            Esta pregunta no tiene opciones configuradas.
                          </p>
                        ) : (
                          options.map((opt) => {
                            const selected = selectedMulti.includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => toggleMulti(field.id, opt)}
                                className={cn(
                                  "min-h-9 px-3 text-sm rounded-md border",
                                  selected
                                    ? "border-forest bg-sage-light text-forest font-medium"
                                    : "border-border bg-white text-ink"
                                )}
                              >
                                {opt}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : field.field_type === "checklist" ? (
                      <div className="flex gap-2">
                        {CHECKLIST_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setField(field.id, opt.value)}
                            className={cn(
                              "flex-1 h-9 text-sm rounded-md border",
                              value === opt.value
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
                    ) : field.field_type === "datetime" ? (
                      <Input
                        type="datetime-local"
                        value={value}
                        onChange={(e) => setField(field.id, e.target.value)}
                      />
                    ) : (
                      <Input
                        value={value}
                        onChange={(e) => setField(field.id, e.target.value)}
                      />
                    )}
                    {numberOut && (
                      <span className="text-danger">
                        Fuera de límite
                        {limits ? ` (${limits.replace("Límite: ", "")})` : ""}
                      </span>
                    )}
                  </div>
                );
              })}
          </fieldset>
        ))}

        <label className="block text-xs text-ink-light space-y-1">
          <span>Observaciones</span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button type="submit" className="w-full" loading={loading}>
          Enviar registro
        </Button>
      </form>
    </div>
  );
}
