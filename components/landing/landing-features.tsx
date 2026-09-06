import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "HACCP en minutos",
    body: "Construye tu plan HACCP con árbol de decisiones guiado, biblioteca de peligros precargada y versionado del plan.",
    quote: "Tu plan HACCP está listo. Falta configurar 2 CCPs para completarlo.",
    accent: "forest",
  },
  {
    icon: ClipboardList,
    title: "Monitoreo de PCC",
    body: "Plantillas configurables, lotes, fotos y desviaciones que se convierten en no conformidades automáticamente.",
    quote: "Registro de lote 2026-042 completado — sin desviaciones.",
    accent: "sage",
  },
  {
    icon: ClipboardCheck,
    title: "Auditorías en planta",
    body: "Ejecuta checklists configurables desde cualquier dispositivo, adjunta fotos y genera el informe automáticamente.",
    quote: "Auditoría interna completada — 94% de cumplimiento.",
    accent: "sage",
  },
  {
    icon: AlertTriangle,
    title: "CAPA que no se pierde",
    body: "Análisis de causa raíz con 5 Porqués e Ishikawa, seguimiento automático y escalamiento de acciones vencidas.",
    quote: "CCP-01 fuera de límite. Revisa el registro de temperatura de cocción de hoy.",
    accent: "amber",
  },
  {
    icon: FileText,
    title: "Control documental",
    body: "Versiones, aprobación con firmas, acuse de lectura y archivos centralizados para tu sistema de gestión.",
    quote: "POE-04 v3 publicada — 8 lecturas pendientes de confirmar.",
    accent: "forest",
  },
  {
    icon: GitBranch,
    title: "Un solo ciclo",
    body: "Plan, documentos, monitoreo, auditoría y CAPA conectados. Sin módulos de calidad que nadie usa.",
    quote: "CCP-01 fuera de límite. La NC se abrió sola desde el monitoreo de hoy.",
    accent: "sage",
  },
];

export function LandingFeatures() {
  return (
    <section id="caracteristicas" className="py-20 md:py-28 bg-background scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-sage mb-3">
            Características
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">
            El sistema de inocuidad que tu equipo sí va a usar.
          </h2>
          <p className="mt-4 text-ink-light leading-relaxed">
            Deja el Excel. Llega a la auditoría listo.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 120}>
              <article className="group h-full bg-white border border-border rounded-lg p-6 transition-all duration-500 hover:border-sage/40 hover:shadow-[0_20px_48px_-20px_rgba(27,67,50,0.18)] hover:-translate-y-1">
                <div
                  className={`h-10 w-10 rounded-md flex items-center justify-center mb-5 transition-colors duration-300 ${
                    feature.accent === "forest"
                      ? "bg-forest/10 text-forest group-hover:bg-forest group-hover:text-white"
                      : feature.accent === "sage"
                        ? "bg-sage-light text-sage group-hover:bg-sage group-hover:text-white"
                        : "bg-amber-light text-amber group-hover:bg-amber group-hover:text-white"
                  }`}
                >
                  <feature.icon className="h-5 w-5" />
                </div>

                <h3 className="text-sm font-semibold text-ink mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-ink-light leading-relaxed mb-5">
                  {feature.body}
                </p>

                <blockquote className="border-l-2 border-sage/40 pl-3 text-xs text-ink-faint italic leading-relaxed">
                  &ldquo;{feature.quote}&rdquo;
                </blockquote>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
