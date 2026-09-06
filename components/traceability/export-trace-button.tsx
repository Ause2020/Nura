"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportTraceChain } from "@/lib/traceability/export";

interface ExportTraceButtonProps {
  lotId: string;
  lotCode: string;
  organizationId: string;
}

export function ExportTraceButton({
  lotId,
  lotCode,
  organizationId,
}: ExportTraceButtonProps) {
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"es" | "en">("es");

  async function handleExport() {
    setLoading(true);
    try {
      await exportTraceChain(lotId, organizationId, lang);
    } catch {
      alert("No se pudo generar el export de trazabilidad");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Language toggle */}
      <div className="flex rounded-md border border-border overflow-hidden h-8 text-xs font-medium">
        <button
          type="button"
          onClick={() => setLang("es")}
          className={`px-2.5 transition-colors ${
            lang === "es"
              ? "bg-forest text-white"
              : "bg-white text-ink-light hover:bg-background"
          }`}
        >
          ES
        </button>
        <button
          type="button"
          onClick={() => setLang("en")}
          className={`px-2.5 border-l border-border transition-colors ${
            lang === "en"
              ? "bg-forest text-white"
              : "bg-white text-ink-light hover:bg-background"
          }`}
        >
          EN
        </button>
      </div>

      <Button
        variant="secondary"
        loading={loading}
        onClick={handleExport}
        className="h-8 text-xs"
        title={`Exportar cadena completa de ${lotCode}`}
      >
        <Download className="h-3.5 w-3.5" />
        Exportar trazabilidad
      </Button>
    </div>
  );
}
