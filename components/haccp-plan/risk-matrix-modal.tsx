"use client";

import { reindexLevels } from "@/lib/haccp-plan/risk";
import type { RiskLevel, RiskMatrix } from "@/lib/haccp-plan/types";

export function RiskMatrixModal({
  open,
  matrix,
  onClose,
  onSave,
}: {
  open: boolean;
  matrix: RiskMatrix;
  onClose: () => void;
  onSave: (matrix: RiskMatrix) => void;
}) {
  if (!open) return null;

  function updateAxis(
    axis: "severity" | "probability",
    levels: RiskLevel[]
  ) {
    onSave({ ...matrix, [axis]: reindexLevels(levels) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ink">Configurar matriz de riesgo</h3>
        <label className="block text-xs text-ink-light">
          Umbral de significancia (severity × probability)
          <input
            type="number"
            min={1}
            value={matrix.significanceThreshold}
            onChange={(event) =>
              onSave({
                ...matrix,
                significanceThreshold: Number(event.target.value) || 9,
              })
            }
            className="mt-1 hp-input"
          />
        </label>
        {(["severity", "probability"] as const).map((axis) => (
          <div key={axis}>
            <p className="text-xs text-ink-light mb-2">
              {axis === "severity" ? "Severidad" : "Probabilidad"}
            </p>
            <div className="space-y-2">
              {matrix[axis].map((level, index) => (
                <div key={level.value} className="flex gap-2">
                  <input
                    value={level.label}
                    onChange={(event) => {
                      const next = matrix[axis].map((item, i) =>
                        i === index ? { ...item, label: event.target.value } : item
                      );
                      updateAxis(axis, next);
                    }}
                    className="hp-input"
                  />
                  {matrix[axis].length > 2 && (
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() =>
                        updateAxis(
                          axis,
                          matrix[axis].filter((_, i) => i !== index)
                        )
                      }
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 text-xs text-sage"
              onClick={() =>
                updateAxis(axis, [
                  ...matrix[axis],
                  { value: matrix[axis].length + 1, label: "Nuevo" },
                ])
              }
            >
              + Nivel
            </button>
          </div>
        ))}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="h-8 px-3 text-xs bg-sage text-white rounded-md">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
