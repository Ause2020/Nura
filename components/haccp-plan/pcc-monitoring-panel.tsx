"use client";

import { useMemo, useState } from "react";
import { createMonitoringRecord } from "@/lib/haccp-plan/monitoring-records";
import type { PccMonitoringRecord } from "@/lib/haccp-plan/monitoring-records";
import type { PccMonitoringForm } from "@/lib/haccp-plan/monitoring-contract";
import { Button } from "@/components/ui/button";

const SHIFTS = ["Mañana", "Tarde", "Noche"] as const;

export function PccMonitoringPanel({
  organizationId,
  userId,
  forms,
  initialRecords,
}: {
  organizationId: string;
  userId: string;
  forms: PccMonitoringForm[];
  initialRecords: PccMonitoringRecord[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [hazardId, setHazardId] = useState(forms[0]?.hazardId ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() =>
    new Date().toTimeString().slice(0, 5)
  );
  const [shift, setShift] = useState<string>("Mañana");
  const [measuredValue, setMeasuredValue] = useState("");
  const [responsible, setResponsible] = useState("");
  const [observations, setObservations] = useState("");
  const [conforms, setConforms] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => forms.find((item) => item.hazardId === hazardId) ?? forms[0],
    [forms, hazardId]
  );

  if (forms.length === 0) {
    return (
      <section className="mb-6 rounded-md border border-border bg-white p-5">
        <h2 className="font-display text-base font-semibold text-ink">
          Monitoreo PCC
        </h2>
        <p className="mt-1 text-sm text-ink-light">
          Aún no hay PCC. Determínalos en el Paso 7 del Plan HACCP. El mismo
          <code className="mx-1 font-mono text-xs">hazardId</code>
          alimenta este formulario.
        </p>
      </section>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const recordedAt = new Date(`${date}T${time}:00`).toISOString();
      const created = await createMonitoringRecord({
        organizationId,
        userId,
        pccReferenceId: selected.hazardId,
        recordedAt,
        shift,
        parameter: selected.parameter,
        measuredValue,
        responsible: responsible || selected.who,
        observations,
        conforms,
      });
      setRecords((prev) => [created, ...prev]);
      setMeasuredValue("");
      setObservations("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-md border border-border bg-white p-5 space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold text-ink">
          Monitoreo PCC
        </h2>
        <p className="text-xs text-ink-light mt-1">
          Registro rápido de PCC definidos en el plan HACCP (pasos 7–9).
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-ink-light sm:col-span-2">
          PCC
          <select
            value={selected?.hazardId ?? ""}
            onChange={(event) => setHazardId(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          >
            {forms.map((form) => (
              <option key={form.hazardId} value={form.hazardId}>
                PCC {form.pccNumber} · {form.processStep} · {form.hazard}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-light">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-light">
          Hora
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-light">
          Turno
          <select
            value={shift}
            onChange={(event) => setShift(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          >
            {SHIFTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-light">
          Parámetro
          <input
            readOnly
            value={selected?.parameter || "Definir en Paso 8"}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-light">
          Valor medido
          <input
            required
            value={measuredValue}
            placeholder={selected?.criticalLimit || "72.4 °C"}
            onChange={(event) => setMeasuredValue(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-light">
          Responsable
          <input
            value={responsible}
            placeholder={selected?.who || "Jefe de Calidad"}
            onChange={(event) => setResponsible(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-light sm:col-span-2">
          Observaciones
          <input
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-ink-light flex items-center gap-2 mt-6">
          <input
            type="checkbox"
            checked={conforms}
            onChange={(event) => setConforms(event.target.checked)}
          />
          Conforme al LC ({selected?.criticalLimit || "—"})
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Registrar monitoreo"}
          </Button>
        </div>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {records.length > 0 && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-background text-ink-faint">
              <tr>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">PCC</th>
                <th className="text-left px-3 py-2">Turno</th>
                <th className="text-left px-3 py-2">Valor</th>
                <th className="text-left px-3 py-2">Responsable</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 12).map((record) => {
                const form = forms.find((item) => item.hazardId === record.pccReferenceId);
                return (
                  <tr key={record.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">
                      {new Date(record.recordedAt).toLocaleString("es")}
                    </td>
                    <td className="px-3 py-2">
                      {form ? `PCC ${form.pccNumber}` : record.pccReferenceId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">{record.shift || "—"}</td>
                    <td className="px-3 py-2">{record.measuredValue}</td>
                    <td className="px-3 py-2">{record.responsible || "—"}</td>
                    <td className="px-3 py-2">
                      {record.conforms === false ? "Desviación" : "Conforme"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
