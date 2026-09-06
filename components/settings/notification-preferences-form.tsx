"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationPreferences } from "@/types/database";

interface NotificationPreferencesFormProps {
  initialPreferences: NotificationPreferences;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-faint mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors duration-150 shrink-0",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
          checked ? "bg-sage" : "bg-zinc-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function NotificationPreferencesForm({
  initialPreferences,
}: NotificationPreferencesFormProps) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (next: NotificationPreferences) => {
    setStatus("saving");
    const response = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email_capa_due: next.email_capa_due,
        email_weekly_summary: next.email_weekly_summary,
        email_audit_completed: next.email_audit_completed,
      }),
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }, []);

  function scheduleSave(next: NotificationPreferences) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(next);
    }, 1000);
  }

  function updatePref(key: keyof NotificationPreferences, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    scheduleSave(next);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="bg-white border border-border rounded-md p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Preferencias de email</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Los cambios se guardan automáticamente.
          </p>
        </div>
        {status === "saving" && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
            <Loader2 className="h-3 w-3 animate-spin" />
            Guardando…
          </span>
        )}
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-sage">
            <Check className="h-3 w-3" />
            Guardado
          </span>
        )}
        {status === "error" && (
          <span className="text-xs text-danger">Error al guardar</span>
        )}
      </div>

      <ToggleRow
        label="Email cuando una CAPA vence"
        description="Aviso 48 horas antes del vencimiento de una NC."
        checked={prefs.email_capa_due}
        onChange={(value) => updatePref("email_capa_due", value)}
      />
      <ToggleRow
        label="Resumen semanal del sistema"
        description="Cada lunes recibes un resumen de NCs y auditorías."
        checked={prefs.email_weekly_summary}
        onChange={(value) => updatePref("email_weekly_summary", value)}
      />
      <ToggleRow
        label="Email al completar una auditoría"
        description="Notifica cuando se cierra una auditoría."
        checked={prefs.email_audit_completed}
        onChange={(value) => updatePref("email_audit_completed", value)}
      />
      <ToggleRow
        label="Notificación in-app para nuevas NCs"
        description="Siempre activa para jefes de calidad y administradores."
        checked={true}
        disabled
        onChange={() => undefined}
      />
    </div>
  );
}
