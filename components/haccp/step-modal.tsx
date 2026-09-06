"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { STEP_TYPES } from "@/lib/haccp/constants";
import { cn } from "@/lib/utils";
import type { HaccpProcessStep, ProcessStepType } from "@/types/database";

export type StepFormData = {
  name: string;
  step_type: ProcessStepType;
  description: string;
  temperature_min: string;
  temperature_max: string;
  duration_minutes: string;
  is_ccp: boolean;
  is_oprp: boolean;
};

interface StepModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: StepFormData) => Promise<void>;
  step?: HaccpProcessStep | null;
  saving?: boolean;
}

const emptyForm: StepFormData = {
  name: "",
  step_type: "reception",
  description: "",
  temperature_min: "",
  temperature_max: "",
  duration_minutes: "",
  is_ccp: false,
  is_oprp: false,
};

function stepToForm(step: HaccpProcessStep): StepFormData {
  return {
    name: step.name,
    step_type: step.step_type,
    description: step.description ?? "",
    temperature_min: step.temperature_min?.toString() ?? "",
    temperature_max: step.temperature_max?.toString() ?? "",
    duration_minutes: step.duration_minutes?.toString() ?? "",
    is_ccp: step.is_ccp,
    is_oprp: step.is_oprp,
  };
}

export function StepModal({
  open,
  onClose,
  onSave,
  step,
  saving,
}: StepModalProps) {
  const [form, setForm] = useState<StepFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(step ? stepToForm(step) : emptyForm);
      setErrors({});
    }
  }, [open, step]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "El nombre es requerido";

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
      title={step ? "Editar paso" : "Agregar paso"}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 -mt-2">
        <Input
          label="Nombre del paso"
          placeholder="Ej. Pasteurización"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          required
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Tipo de paso
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STEP_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, step_type: value })}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md border text-xs font-medium transition-colors duration-150",
                  form.step_type === value
                    ? "border-forest bg-sage-light text-forest"
                    : "border-border bg-white text-ink-light hover:bg-background"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label="Descripción"
          placeholder="Detalle del paso..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Temp. mín (°C)"
            type="number"
            step="0.1"
            value={form.temperature_min}
            onChange={(e) =>
              setForm({ ...form, temperature_min: e.target.value })
            }
          />
          <Input
            label="Temp. máx (°C)"
            type="number"
            step="0.1"
            value={form.temperature_max}
            onChange={(e) =>
              setForm({ ...form, temperature_max: e.target.value })
            }
          />
        </div>

        <Input
          label="Duración (minutos)"
          type="number"
          min={0}
          value={form.duration_minutes}
          onChange={(e) =>
            setForm({ ...form, duration_minutes: e.target.value })
          }
        />

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_ccp}
              onChange={(e) =>
                setForm({
                  ...form,
                  is_ccp: e.target.checked,
                  is_oprp: e.target.checked ? false : form.is_oprp,
                })
              }
              className="h-4 w-4 rounded border-border text-forest focus-visible:ring-sage"
            />
            <span className="text-sm text-ink">Es CCP</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_oprp}
              onChange={(e) =>
                setForm({
                  ...form,
                  is_oprp: e.target.checked,
                  is_ccp: e.target.checked ? false : form.is_ccp,
                })
              }
              className="h-4 w-4 rounded border-border text-forest focus-visible:ring-sage"
            />
            <span className="text-sm text-ink">Es OPRP</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {step ? "Guardar" : "Agregar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
