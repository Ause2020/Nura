"use client";

import { Plus, Settings2, Trash2 } from "lucide-react";
import { HAZARD_CATALOG } from "@/lib/haccp-plan/constants";
import { isSignificant, riskScore } from "@/lib/haccp-plan/risk";
import type { Hazard, HazardType, ProcessDiagram, RiskMatrix } from "@/lib/haccp-plan/types";
import { cn } from "@/lib/utils";

export function Step6Hazards({
  hazards,
  diagrams,
  matrix,
  onAdd,
  onChange,
  onDelete,
  onOpenMatrix,
}: {
  hazards: Hazard[];
  diagrams: ProcessDiagram[];
  matrix: RiskMatrix;
  onAdd: () => void;
  onChange: (hazard: Hazard) => void;
  onDelete: (id: string) => void;
  onOpenMatrix: () => void;
}) {
  const threshold = matrix.significanceThreshold;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="h-8 px-3 rounded-md text-xs bg-sage text-white inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar peligro
        </button>
        <button
          type="button"
          onClick={onOpenMatrix}
          className="h-8 px-3 rounded-md text-xs bg-white border border-border text-ink-light inline-flex items-center gap-1"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Configurar matriz
        </button>
      </div>
      {hazards.length === 0 && (
        <p className="text-sm text-ink-light">
          No hay peligros. Agrégalos por etapa del diagrama (solo step y PCC).
        </p>
      )}
      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="min-w-[920px] w-full text-[11px]">
          <thead className="bg-background text-ink-faint uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-2">Proceso</th>
              <th className="text-left px-2 py-2">Etapa</th>
              <th className="text-left px-2 py-2">Peligro</th>
              <th className="text-left px-2 py-2">Causa</th>
              <th className="text-left px-2 py-2">Sev.</th>
              <th className="text-left px-2 py-2">Prob.</th>
              <th className="text-left px-2 py-2">Significativo</th>
              <th className="text-left px-2 py-2">Medida preventiva</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {hazards.map((hazard) => {
              const diagram =
                diagrams.find((item) => item.id === hazard.diagramId) ?? diagrams[0];
              const stages = (diagram?.nodes ?? []).filter(
                (node) => node.type === "step" || node.type === "pcc"
              );
              const significant = isSignificant(
                hazard.severity,
                hazard.probability,
                threshold
              );
              const score = riskScore(hazard.severity, hazard.probability);
              return (
                <tr key={hazard.id} className="border-t border-border align-top">
                  <td className="px-2 py-1.5">
                    <select
                      value={hazard.diagramId || diagram?.id || ""}
                      onChange={(event) =>
                        onChange({ ...hazard, diagramId: event.target.value, stepId: "" })
                      }
                      className="hp-input"
                    >
                      {diagrams.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={hazard.stepId}
                      onChange={(event) =>
                        onChange({ ...hazard, stepId: event.target.value })
                      }
                      className="hp-input"
                    >
                      <option value="">Etapa</option>
                      {stages.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={`${hazard.type}::${hazard.description}`}
                      onChange={(event) => {
                        const [type, description] = event.target.value.split("::");
                        onChange({
                          ...hazard,
                          type: type as HazardType,
                          description,
                        });
                      }}
                      className="hp-input"
                    >
                      <option value="biological::">Seleccionar</option>
                      {Object.entries(HAZARD_CATALOG).map(([type, items]) => (
                        <optgroup
                          key={type}
                          label={
                            type === "biological"
                              ? "Biológicos"
                              : type === "chemical"
                                ? "Químicos"
                                : "Físicos"
                          }
                        >
                          {items.map((item) => (
                            <option key={item} value={`${type}::${item}`}>
                              {item}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={hazard.cause}
                      onChange={(event) =>
                        onChange({ ...hazard, cause: event.target.value })
                      }
                      className="hp-input"
                    />
                  </td>
                  <td className="px-2 py-1.5 w-16">
                    <select
                      value={hazard.severity}
                      onChange={(event) =>
                        onChange({ ...hazard, severity: Number(event.target.value) })
                      }
                      className="hp-input"
                    >
                      {matrix.severity.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-16">
                    <select
                      value={hazard.probability}
                      onChange={(event) =>
                        onChange({ ...hazard, probability: Number(event.target.value) })
                      }
                      className="hp-input"
                    >
                      {matrix.probability.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full font-mono",
                        significant
                          ? "bg-red-50 text-danger"
                          : "bg-background text-ink-faint"
                      )}
                    >
                      {significant ? "SI" : "NO"} {score}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={hazard.preventiveMeasure}
                      onChange={(event) =>
                        onChange({ ...hazard, preventiveMeasure: event.target.value })
                      }
                      className="hp-input"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => onDelete(hazard.id)}>
                      <Trash2 className="h-4 w-4 text-ink-faint" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
