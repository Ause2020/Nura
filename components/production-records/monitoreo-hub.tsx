import Link from "next/link";
import {
  Camera,
  ClipboardList,
  FileStack,
  QrCode,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";

interface MonitoreoHubProps {
  templateCount: number;
  activeQrCount: number;
  recordsToday: number;
  canManage: boolean;
}

const PANELS = [
  {
    href: "/registros/generar",
    icon: QrCode,
    title: "Generar",
    kicker: "QR para terreno",
    body: "Elige una plantilla y genera un QR. El monitor lo abre en el teléfono y carga la ruta; los datos llegan al histórico.",
  },
  {
    href: "/registros/historico",
    icon: ClipboardList,
    title: "Histórico",
    kicker: "Resultados",
    body: "Registros de QR, formularios y planillas digitalizadas, con tendencia de conformidad y desviaciones.",
  },
  {
    href: "/registros/plantillas",
    icon: FileStack,
    title: "Plantillas",
    kicker: "Diseño",
    body: "El ingeniero de inocuidad arma las planillas. Quedan listas para generar QR o llenar en planta.",
  },
  {
    href: "/registros/digitalizar",
    icon: Camera,
    title: "Digitalizar",
    kicker: "Del papel al sistema",
    body: "Sube la foto o el escaneo de una planilla manuscrita. Extraemos los datos y los mandamos al histórico.",
  },
] as const;

export function MonitoreoHub({
  templateCount,
  activeQrCount,
  recordsToday,
  canManage,
}: MonitoreoHubProps) {
  const stats: Record<string, string> = {
    "/registros/generar": `${activeQrCount} QR activos`,
    "/registros/historico": `${recordsToday} hoy`,
    "/registros/plantillas": `${templateCount} plantillas`,
    "/registros/digitalizar": canManage ? "OCR de planillas" : "Revisar con calidad",
  };

  return (
    <>
      <ModuleHeader
        title="Monitoreo"
        description="Rutas en terreno, histórico y planillas en un solo módulo"
      />
      <MonitoreoNav />
      <div className="px-6 py-6 grid gap-4 sm:grid-cols-2 max-w-5xl">
        {PANELS.map((panel) => {
          const Icon = panel.icon;
          return (
            <Link
              key={panel.href}
              href={panel.href}
              className="bg-white rounded-md border border-border p-5 hover:border-sage/50 hover:bg-background transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="h-9 w-9 rounded-md bg-sage-light text-forest flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-mono text-ink-faint">
                  {stats[panel.href]}
                </span>
              </div>
              <p className="text-xs font-mono uppercase tracking-wider text-ink-faint mt-4">
                {panel.kicker}
              </p>
              <h2 className="text-lg font-semibold text-ink font-display mt-0.5 group-hover:text-forest">
                {panel.title}
              </h2>
              <p className="text-sm text-ink-light mt-2 leading-relaxed">
                {panel.body}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
