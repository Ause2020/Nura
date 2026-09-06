"use client";

import { MONITORING_FREQUENCIES } from "@/lib/haccp-plan/constants";
import type { CriticalLimit, HazardRow, MonitoringPlan } from "@/lib/haccp-plan/types";

export function Step9Monitoring({
  ccps,
  limits,
  plans,
  onChange,
}: {
  ccps: HazardRow[];
  limits: CriticalLimit[];
  plans: MonitoringPlan[];
  onChange: (plans: MonitoringPlan[]) => void;
}) {
  if (ccps.length === 0) {
    return (
      <p className="text-sm text-ink-light">
        Complete primero el Paso 7. El monitoreo se arma por cada PCC.
      </p>
    );
  }

  function upsert(hazardId: string, patch: Partial<MonitoringPlan>) {
    const pccNumber = ccps.findIndex((item) => item.id === hazardId) + 1;
    const current = plans.find((item) => item.hazardId === hazardId);
    const next: MonitoringPlan = {
      hazardId,
      pccNumber,
      what: current?.what ?? "",
      how: current?.how ?? "",
      frequency: current?.frequency ?? "Cada lote",
      who: current?.who ?? "",
      records: current?.records ?? "",
      calibration: current?.calibration ?? "",
      ...patch,
    };
    onChange([...plans.filter((item) => item.hazardId !== hazardId), next]);
  }

  return (
    <div className="space-y-4">
      {ccps.map((ccp, index) => {
        const plan = plans.find((item) => item.hazardId === ccp.id);
        const limit = limits.find((item) => item.hazardId === ccp.id);
        return (
          <article key={ccp.id} className="rounded-lg border border-border bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 rounded">
                PCC {index + 1}
              </span>
              <span className="text-sm text-ink">{ccp.processStep}</span>
              <span className="text-[11px] text-ink-faint">
                LC {limit?.criticalLimit || "—"} · LO {limit?.operationalLimit || "—"}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="QUÉ" value={plan?.what ?? ""} placeholder="Temperatura de cocción" onChange={(value) => upsert(ccp.id, { what: value })} />
              <Field label="CÓMO" value={plan?.how ?? ""} placeholder="Termómetro calibrado en el centro térmico" onChange={(value) => upsert(ccp.id, { how: value })} />
              <label className="text-xs text-ink-light">
                CUÁNDO
                <select
                  value={plan?.frequency ?? "Cada lote"}
                  onChange={(event) => upsert(ccp.id, { frequency: event.target.value })}
                  className="mt-1 hp-input"
                >
                  {MONITORING_FREQUENCIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <Field label="QUIÉN" value={plan?.who ?? ""} placeholder="Operador de cocción / Jefe de Calidad" onChange={(value) => upsert(ccp.id, { who: value })} />
              <Field label="Registros" value={plan?.records ?? ""} placeholder="Planilla CCP-01 / Nura Monitoreo" onChange={(value) => upsert(ccp.id, { records: value })} />
              <Field label="Calibración" value={plan?.calibration ?? ""} placeholder="Termómetro patrón semanal" onChange={(value) => upsert(ccp.id, { calibration: value })} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-ink-light">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 hp-input"
      />
    </label>
  );
}
