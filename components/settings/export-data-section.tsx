"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function ExportDataSection() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/export");
      if (!response.ok) {
        throw new Error("No se pudo exportar");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nura-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Error al exportar datos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white border border-border rounded-md p-4 md:p-6">
      <h2 className="text-sm font-semibold text-ink mb-1">Backup técnico</h2>
      <p className="text-xs text-ink-faint mb-4">
        Descarga un respaldo JSON con todos los datos de tu organización (HACCP,
        auditorías, CAPA, configuración). Útil para migraciones o soporte técnico.
        Para informes de auditoría en PDF o Excel, usa el botón de exportación
        dentro de cada auditoría completada.
      </p>
      <Button variant="secondary" loading={loading} onClick={handleExport}>
        <Download className="h-4 w-4" />
        Descargar backup técnico (JSON)
      </Button>
    </section>
  );
}
