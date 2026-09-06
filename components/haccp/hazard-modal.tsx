"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { getHazardSuggestions } from "@/lib/hazards-library";
import {
  calculateRisk,
  getMatrixCellColor,
  HAZARD_TYPE_CONFIG,
  MATRIX_PROBABILITIES,
  MATRIX_SEVERITIES,
  PROBABILITY_LABELS,
  SEVERITY_LABELS,
} from "@/lib/haccp/risk-matrix";
import { cn } from "@/lib/utils";
import type {
  HaccpHazard,
  HaccpProcessStep,
  HazardType,
  Probability,
  Severity,
} from "@/types/database";

export interface HazardFormData {
  hazard_type: HazardType;
  hazard_description: string;
  source: string;
  severity: Severity;
  probability: Probability;
  control_measures: string;
  notes: string;
}

interface HazardModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: HazardFormData) => Promise<void>;
  step: HaccpProcessStep;
  hazard?: HaccpHazard | null;
  saving?: boolean;
}

const emptyForm: HazardFormData = {
  hazard_type: "biological",
  hazard_description: "",
  source: "",
  severity: "medium",
  probability: "medium",
  control_measures: "",
  notes: "",
};

export function HazardModal({
  open,
  onClose,
  onSave,
  step,
  hazard,
  saving,
}: HazardModalProps) {
  const [form, setForm] = useState<HazardFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<
    ReturnType<typeof getHazardSuggestions>
  >([]);

  useEffect(() => {
    if (open) {
      if (hazard) {
        setForm({
          hazard_type: hazard.hazard_type,
          hazard_description: hazard.hazard_description,
          source: hazard.source ?? "",
          severity: hazard.severity,
          probability: hazard.probability,
          control_measures: hazard.control_measures ?? "",
          notes: hazard.notes ?? "",
        });
      } else {
        setForm(emptyForm);
      }
      setErrors({});
    }
  }, [open, hazard]);

  useEffect(() => {
    setSuggestions(getHazardSuggestions(step.step_type, form.hazard_type));
  }, [step.step_type, form.hazard_type]);

  const risk = calculateRisk(form.severity, form.probability);

  function selectMatrix(severity: Severity, probability: Probability) {
    setForm((f) => ({ ...f, severity, probability }));
  }

  function applySuggestion(s: (typeof suggestions)[0]) {
    setForm((f) => ({
      ...f,
      hazard_type: s.hazard_type,
      hazard_description: s.description,
      source: s.source,
      control_measures: s.control_measures,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.hazard_description.trim())
      nextErrors.hazard_description = "La descripción es requerida";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    await onSave(form);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hazard ? "Editar peligro" : "Agregar peligro"}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 -mt-2">
        <p className="text-xs text-ink-faint">
          Paso: <span className="font-medium text-ink">{step.name}</span>
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Tipo de peligro
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(HAZARD_TYPE_CONFIG) as HazardType[]).map((type) => {
              const config = HAZARD_TYPE_CONFIG[type];
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, hazard_type: type })}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md border text-xs font-medium transition-colors duration-150",
                    form.hazard_type === type
                      ? "border-forest bg-sage-light text-forest"
                      : "border-border bg-white text-ink-light hover:bg-background"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {suggestions.length > 0 && !hazard && (
          <div className="space-y-1">
            <p className="text-xs text-ink-faint">Sugerencias comunes:</p>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {suggestions.slice(0, 6).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className="text-left px-2 py-1 text-xs rounded-md border border-border bg-background hover:border-sage hover:bg-sage-light/50 transition-colors duration-150"
                >
                  {s.description.slice(0, 55)}
                  {s.description.length > 55 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <Textarea
          label="Descripción del peligro"
          placeholder="Describe el peligro identificado..."
          value={form.hazard_description}
          onChange={(e) =>
            setForm({ ...form, hazard_description: e.target.value })
          }
          error={errors.hazard_description}
          required
        />

        <Input
          label="Origen / fuente"
          placeholder="ej. Materia prima, equipos, personal..."
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Matriz de riesgo (severidad × probabilidad)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-1" />
                  {MATRIX_PROBABILITIES.map((p) => (
                    <th
                      key={p}
                      className="p-1 font-mono text-ink-faint font-normal text-center"
                    >
                      {PROBABILITY_LABELS[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...MATRIX_SEVERITIES].reverse().map((sev) => (
                  <tr key={sev}>
                    <td className="p-1 font-mono text-ink-faint whitespace-nowrap">
                      {SEVERITY_LABELS[sev]}
                    </td>
                    {MATRIX_PROBABILITIES.map((prob) => {
                      const selected =
                        form.severity === sev && form.probability === prob;
                      const cellRisk = calculateRisk(sev, prob);
                      return (
                        <td key={prob} className="p-0.5">
                          <button
                            type="button"
                            onClick={() => selectMatrix(sev, prob)}
                            className={cn(
                              "w-full h-10 rounded-md border transition-all duration-150 text-[10px] font-mono",
                              getMatrixCellColor(sev, prob),
                              selected
                                ? "border-forest ring-2 ring-forest ring-offset-1"
                                : "border-transparent"
                            )}
                          >
                            {cellRisk.risk_level}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-faint">
            Nivel calculado:{" "}
            <span className="font-medium text-ink capitalize">
              {risk.risk_level}
            </span>
            {risk.is_significant && (
              <span className="text-amber ml-1">· Significativo</span>
            )}
          </p>
        </div>

        <Textarea
          label="Medidas de control"
          placeholder="Medidas preventivas o de control existentes..."
          value={form.control_measures}
          onChange={(e) =>
            setForm({ ...form, control_measures: e.target.value })
          }
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {hazard ? "Guardar" : "Agregar peligro"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
