"use client";

import { PRODUCT_DISPOSITIONS } from "@/lib/haccp-plan/constants";
import type { CorrectiveAction, CriticalLimit, HazardRow } from "@/lib/haccp-plan/types";

export function Step10Corrective({
  ccps,
  limits,
  actions,
  onChange,
}: {
  ccps: HazardRow[];
  limits: CriticalLimit[];
  actions: CorrectiveAction[];
  onChange: (actions: CorrectiveAction[]) => void;
}) {
  if (ccps.length === 0) {
    return (
      <p className="text-sm text-ink-light">
        Complete primero el Paso 7. Las acciones correctivas se definen por PCC.
      </p>
    );
  }

  function upsert(hazardId: string, patch: Partial<CorrectiveAction>) {
    const pccNumber = ccps.findIndex((item) => item.id === hazardId) + 1;
    const current = actions.find((item) => item.hazardId === hazardId);
    const next: CorrectiveAction = {
      hazardId,
      pccNumber,
      productAction: current?.productAction ?? "Retener y evaluar",
      processCorrection: current?.processCorrection ?? "",
      responsible: current?.responsible ?? "",
      notifyTo: current?.notifyTo ?? "",
      records: current?.records ?? "",
      preventiveAction: current?.preventiveAction ?? "",
      ...patch,
    };
    onChange([...actions.filter((item) => item.hazardId !== hazardId), next]);
  }

  return (
    <div className="space-y-4">
      {ccps.map((ccp, index) => {
        const action = actions.find((item) => item.hazardId === ccp.id);
        const limit = limits.find((item) => item.hazardId === ccp.id);
        return (
          <article key={ccp.id} className="rounded-lg border border-border bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 rounded">
                PCC {index + 1}
              </span>
              <span className="text-sm text-ink">{ccp.processStep}</span>
            </div>
            <p className="text-xs text-amber bg-amber-light border border-amber/20 rounded-md px-3 py-2">
              Se detecta que {limit?.parameter || "el parámetro"} no cumple LC (
              {limit?.criticalLimit || "sin límite"}).
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-ink-light">
                Disposición del producto *
                <select
                  value={action?.productAction ?? "Retener y evaluar"}
                  onChange={(event) => upsert(ccp.id, { productAction: event.target.value })}
                  className="mt-1 hp-input"
                >
                  {PRODUCT_DISPOSITIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <Field label="Corrección de la causa" value={action?.processCorrection ?? ""} placeholder="Ajustar tiempo/temperatura y recalibrar" onChange={(value) => upsert(ccp.id, { processCorrection: value })} />
              <Field label="Responsable" value={action?.responsible ?? ""} placeholder="Jefe de Calidad" onChange={(value) => upsert(ccp.id, { responsible: value })} />
              <Field label="A quién notificar" value={action?.notifyTo ?? ""} placeholder="Gerente de planta y PCQI" onChange={(value) => upsert(ccp.id, { notifyTo: value })} />
              <Field label="Registros" value={action?.records ?? ""} placeholder="Acta de retención / NC en CAPA" onChange={(value) => upsert(ccp.id, { records: value })} />
              <Field label="Acción preventiva" value={action?.preventiveAction ?? ""} placeholder="Capacitar turno y revisar SOP de cocción" onChange={(value) => upsert(ccp.id, { preventiveAction: value })} />
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
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 hp-input" />
    </label>
  );
}
