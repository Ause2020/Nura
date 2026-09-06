"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuickCaptureShell } from "./quick-capture-modal";
import type { ProductionFormTemplate } from "@/types/database";

interface QuickRegistroProps {
  templates: Pick<ProductionFormTemplate, "id" | "name" | "area">[];
  onClose: () => void;
}

export function QuickRegistro({ templates, onClose }: QuickRegistroProps) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [lotNumber, setLotNumber] = useState("");
  const [deviationNotes, setDeviationNotes] = useState("");
  const [hasDeviation, setHasDeviation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function handleSubmit() {
    if (!templateId) {
      setError("Selecciona una plantilla");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/quick-capture/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        lotNumber: lotNumber.trim() || null,
        area: selectedTemplate?.area ?? null,
        deviationNotes: hasDeviation ? deviationNotes.trim() || null : null,
        // Quick capture sends no field values — the submission will have
        // has_deviation = false and status = ok. For a real value capture
        // the user follows the link to complete the full form.
        values: [],
      }),
    });
    const json = await res.json() as { submissionId?: string; error?: string };

    setLoading(false);
    if (!res.ok || !json.submissionId) {
      setError(json.error ?? "Error al guardar");
      return;
    }

    onClose();
    router.push(`/registros/${json.submissionId}`);
    router.refresh();
  }

  if (templates.length === 0) {
    return (
      <QuickCaptureShell
        title="Monitoreo rápido"
        onClose={onClose}
        onSubmit={onClose}
        loading={false}
        error=""
        submitLabel="Cerrar"
      >
        <p className="text-sm text-ink-light text-center py-4">
          No hay plantillas activas. Crea una plantilla en{" "}
          <span className="font-medium text-forest">Monitoreo → Plantillas</span>{" "}
          para usar la captura rápida.
        </p>
      </QuickCaptureShell>
    );
  }

  return (
    <QuickCaptureShell
      title="Monitoreo rápido"
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      submitLabel="Iniciar registro"
    >
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
          Plantilla <span className="text-danger">*</span>
        </p>
        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={`h-12 rounded-md border text-left px-3 text-sm transition-colors duration-150 ${
                templateId === t.id
                  ? "border-forest bg-sage-light text-forest font-medium"
                  : "border-border bg-white text-ink-light hover:bg-background"
              }`}
            >
              <span className="block truncate">{t.name}</span>
              {t.area && (
                <span className="block text-[10px] font-mono truncate opacity-70">
                  {t.area}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
          N° de lote
        </label>
        <input
          type="text"
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
          placeholder="Ej. L-2026-042"
          className="w-full h-12 px-3 text-sm border border-border rounded-md font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage placeholder:text-ink-faint"
        />
      </div>

      <label className="flex items-center gap-3 h-12 px-3 rounded-md border border-border bg-white cursor-pointer">
        <input
          type="checkbox"
          checked={hasDeviation}
          onChange={(e) => setHasDeviation(e.target.checked)}
          className="h-5 w-5 accent-forest"
        />
        <span className="text-sm text-ink-light">Hay una desviación</span>
      </label>

      {hasDeviation && (
        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
            Descripción de la desviación
          </label>
          <textarea
            value={deviationNotes}
            onChange={(e) => setDeviationNotes(e.target.value)}
            placeholder="Describe brevemente la desviación detectada..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border rounded-md resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage placeholder:text-ink-faint"
          />
        </div>
      )}

      <p className="text-[11px] text-ink-faint">
        Esto crea el registro con los datos mínimos. Completa los valores del
        autocontrol desde la ficha de registro.
      </p>
    </QuickCaptureShell>
  );
}
