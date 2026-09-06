"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_COMPLAINT_SLA_HOURS,
  parseAutoNcThreshold,
  type ComplaintAutoNcThreshold,
} from "@/lib/complaints/sla";

interface ComplaintSlaSettingsProps {
  slaHours: number;
  autoNcThreshold: ComplaintAutoNcThreshold;
}

export function ComplaintSlaSettings({
  slaHours: initialSla,
  autoNcThreshold: initialThreshold,
}: ComplaintSlaSettingsProps) {
  const [slaHours, setSlaHours] = useState(String(initialSla));
  const [autoNcThreshold, setAutoNcThreshold] =
    useState<ComplaintAutoNcThreshold>(initialThreshold);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage("");
    const hours = Number(slaHours);
    if (Number.isNaN(hours) || hours < 48 || hours > 72) {
      setMessage("El SLA debe estar entre 48 y 72 horas");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complaint_response_sla_hours: Math.round(hours),
        complaint_auto_nc_severity: autoNcThreshold,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setMessage(data.error ?? "Error al guardar");
      return;
    }
    setMessage("Configuración guardada");
  }

  return (
    <div className="bg-white border border-border rounded-md p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Configuración SLA</h3>
        <p className="text-xs text-ink-faint mt-1">
          Plazo de respuesta al cliente y umbral de NC automática
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="SLA respuesta (horas)"
          type="number"
          min={48}
          max={72}
          value={slaHours}
          onChange={(e) => setSlaHours(e.target.value)}
          hint={`Predeterminado: ${DEFAULT_COMPLAINT_SLA_HOURS}h (48–72)`}
        />
        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
            NC automática desde severidad
          </label>
          <select
            value={autoNcThreshold}
            onChange={(e) =>
              setAutoNcThreshold(parseAutoNcThreshold(e.target.value))
            }
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            <option value="none">Desactivada</option>
            <option value="safety_critical">Seguridad crítica</option>
            <option value="quality">Calidad o superior</option>
          </select>
        </div>
      </div>

      {message && (
        <p
          className={`text-xs ${
            message.includes("Error") || message.includes("debe")
              ? "text-danger"
              : "text-sage"
          }`}
        >
          {message}
        </p>
      )}

      <Button type="button" onClick={handleSave} loading={saving} className="h-8">
        Guardar configuración
      </Button>
    </div>
  );
}
