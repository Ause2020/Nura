"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  VERIFICATION_CATEGORIES,
  VERIFICATION_FREQUENCIES,
} from "@/lib/haccp-plan/constants";
import type { VerificationActivity } from "@/lib/haccp-plan/types";

export function Step11Verification({
  activities,
  observations,
  onChange,
  onObservations,
}: {
  activities: VerificationActivity[];
  observations: string;
  onChange: (activities: VerificationActivity[]) => void;
  onObservations: (value: string) => void;
}) {
  function add() {
    onChange([
      ...activities,
      {
        id: crypto.randomUUID(),
        category: "records_review",
        description: "",
        frequency: "Semanal",
        responsible: "Jefe de Calidad",
        records: "",
        status: "pending",
      },
    ]);
  }

  function patch(id: string, next: Partial<VerificationActivity>) {
    onChange(activities.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }

  return (
    <div className="space-y-4">
      {activities.length === 0 && (
        <p className="text-sm text-ink-light">
          La verificación no depende de PCC. Agrega calibración, muestreos y revisión de registros.
        </p>
      )}
      {activities.map((activity) => {
        const meta = VERIFICATION_CATEGORIES.find((item) => item.value === activity.category);
        return (
          <article key={activity.id} className="rounded-lg border border-border bg-white p-4 space-y-3">
            <div className="flex justify-end">
              <button type="button" onClick={() => onChange(activities.filter((item) => item.id !== activity.id))}>
                <Trash2 className="h-4 w-4 text-ink-faint" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-ink-light">
                Categoría
                <select
                  value={activity.category}
                  onChange={(event) =>
                    patch(activity.id, {
                      category: event.target.value as VerificationActivity["category"],
                    })
                  }
                  className="mt-1 hp-input"
                >
                  {VERIFICATION_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-light">
                Frecuencia
                <select
                  value={activity.frequency}
                  onChange={(event) => patch(activity.id, { frequency: event.target.value })}
                  className="mt-1 hp-input"
                >
                  {VERIFICATION_FREQUENCIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-light sm:col-span-2">
                Descripción
                <input
                  value={activity.description}
                  placeholder={meta?.placeholder}
                  onChange={(event) => patch(activity.id, { description: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
              <label className="text-xs text-ink-light">
                Responsable
                <input
                  value={activity.responsible}
                  onChange={(event) => patch(activity.id, { responsible: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
              <label className="text-xs text-ink-light">
                Registros asociados
                <input
                  value={activity.records}
                  onChange={(event) => patch(activity.id, { records: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
            </div>
          </article>
        );
      })}
      <button type="button" onClick={add} className="h-8 px-3 rounded-md text-xs bg-white border border-border text-ink-light inline-flex items-center gap-1">
        <Plus className="h-3.5 w-3.5" />
        Agregar actividad
      </button>
      <label className="block text-xs text-ink-light">
        Observaciones generales del plan
        <textarea
          value={observations}
          onChange={(event) => onObservations(event.target.value)}
          rows={3}
          className="mt-1 hp-input"
        />
      </label>
    </div>
  );
}
