"use client";

import { CRITICAL_LIMIT_PARAMETERS } from "@/lib/haccp-plan/constants";
import type { CriticalLimit, HazardRow } from "@/lib/haccp-plan/types";

export function Step8Limits({
  ccps,
  limits,
  onChange,
}: {
  ccps: HazardRow[];
  limits: CriticalLimit[];
  onChange: (limits: CriticalLimit[]) => void;
}) {
  if (ccps.length === 0) {
    return (
      <p className="text-sm text-ink-light">
        Complete primero el Paso 7. Aquí aparecen solo los peligros marcados como PCC.
      </p>
    );
  }

  function upsert(hazardId: string, patch: Partial<CriticalLimit>) {
    const pccNumber = ccps.findIndex((item) => item.id === hazardId) + 1;
    const current = limits.find((item) => item.hazardId === hazardId);
    const next: CriticalLimit = {
      hazardId,
      pccNumber,
      parameter: current?.parameter ?? "Temperatura (°C)",
      criticalLimit: current?.criticalLimit ?? "",
      operationalLimit: current?.operationalLimit ?? "",
      scientificBasis: current?.scientificBasis ?? "",
      monitoringMethod: current?.monitoringMethod ?? "",
      ...patch,
    };
    onChange([
      ...limits.filter((item) => item.hazardId !== hazardId),
      next,
    ]);
  }

  return (
    <div className="space-y-4">
      {ccps.map((ccp, index) => {
        const limit = limits.find((item) => item.hazardId === ccp.id);
        const defined = Boolean(limit?.criticalLimit.trim());
        return (
          <article key={ccp.id} className="rounded-lg border border-border bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 rounded">
                PCC {index + 1}
              </span>
              <span className="text-sm text-ink">{ccp.processStep}</span>
              <span className="text-xs text-ink-faint">{ccp.description}</span>
              <span className="ml-auto text-[11px] text-ink-faint">
                {defined ? "límite definido" : "pendiente"}
              </span>
            </div>
            <p className="text-[11px] text-ink-faint">Medida: {ccp.controlMeasures || "—"}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-ink-light">
                Parámetro
                <select
                  value={limit?.parameter ?? "Temperatura (°C)"}
                  onChange={(event) => upsert(ccp.id, { parameter: event.target.value })}
                  className="mt-1 hp-input"
                >
                  {CRITICAL_LIMIT_PARAMETERS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-light">
                Límite crítico *
                <input
                  value={limit?.criticalLimit ?? ""}
                  placeholder="≥ 72°C por 15 segundos"
                  onChange={(event) => upsert(ccp.id, { criticalLimit: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
              <label className="text-xs text-ink-light">
                Límite operacional
                <input
                  value={limit?.operationalLimit ?? ""}
                  placeholder="≥ 75°C"
                  onChange={(event) => upsert(ccp.id, { operationalLimit: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
              <label className="text-xs text-ink-light">
                Método de monitoreo
                <input
                  value={limit?.monitoringMethod ?? ""}
                  placeholder="Termómetro calibrado en el punto más frío"
                  onChange={(event) => upsert(ccp.id, { monitoringMethod: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
              <label className="text-xs text-ink-light sm:col-span-2">
                Base científica / normativa
                <input
                  value={limit?.scientificBasis ?? ""}
                  placeholder="NCh 2861 / Codex CAC/RCP 1 — tratamiento térmico validado"
                  onChange={(event) => upsert(ccp.id, { scientificBasis: event.target.value })}
                  className="mt-1 hp-input"
                />
              </label>
            </div>
          </article>
        );
      })}
      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-background text-ink-faint uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">PCC</th>
              <th className="text-left px-3 py-2">Etapa</th>
              <th className="text-left px-3 py-2">Peligro</th>
              <th className="text-left px-3 py-2">Parámetro</th>
              <th className="text-left px-3 py-2">LC</th>
              <th className="text-left px-3 py-2">LO</th>
              <th className="text-left px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ccps.map((ccp, index) => {
              const limit = limits.find((item) => item.hazardId === ccp.id);
              const defined = Boolean(limit?.criticalLimit.trim());
              return (
                <tr key={ccp.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">PCC {index + 1}</td>
                  <td className="px-3 py-2">{ccp.processStep}</td>
                  <td className="px-3 py-2">{ccp.description}</td>
                  <td className="px-3 py-2">{limit?.parameter || "—"}</td>
                  <td className="px-3 py-2">{limit?.criticalLimit || "—"}</td>
                  <td className="px-3 py-2">{limit?.operationalLimit || "—"}</td>
                  <td className="px-3 py-2">{defined ? "definido" : "pendiente"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
