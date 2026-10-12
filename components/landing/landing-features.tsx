import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  FileText,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Plan HACCP de 12 pasos",
    body: "Asistente Codex / NCh 2861: equipo, producto, diagrama, peligros, árbol de PCC, límites, monitoreo, correctivas y verificación. Se guarda solo mientras avanzas.",
    quote: "El plan queda en un solo lugar, con versiones cuando lo publicas.",
    accent: "forest",
  },
  {
    icon: QrCode,
    title: "Monitoreo en planta",
    body: "Plantillas propias, formulario en sala, QR para el monitor (sin usuario) y digitalización de planillas de papel. Una desviación abre el borrador de NC.",
    quote: "El QR vive en el puesto. El dato entra al histórico de la empresa.",
    accent: "sage",
  },
  {
    icon: ClipboardList,
    title: "Histórico de registros",
    body: "Cada envío (formulario, QR u OCR) queda con lote, valores, quién midió y si hubo desviación. No se borra solo.",
    quote: "Mismo histórico para planta, QR y papel digitalizado.",
    accent: "sage",
  },
  {
    icon: ClipboardCheck,
    title: "Auditorías internas",
    body: "Checklist por requisito, foto y hallazgo. Cumplimiento en vivo e informe PDF cuando lo descargas — no ocupa disco hasta pedirlo.",
    quote: "El cajón de hallazgo se guarda al cerrar. No se pierde el texto.",
    accent: "sage",
  },
  {
    icon: AlertTriangle,
    title: "CAPA que se puede seguir",
    body: "Etapas, contención, 5 Porqués e Ishikawa, acciones y verificación de eficacia. El borrador se persiste al escribir, no recién al avanzar.",
    quote: "La NC nace del monitoreo o de la auditoría. No del correo.",
    accent: "amber",
  },
  {
    icon: FileText,
    title: "Documentos controlados",
    body: "Versiones, aprobación y archivo privado por empresa. POES y procedimientos con historial, no carpetas sueltas.",
    quote: "Cada versión queda atada a la organización. Nadie ve la de otra planta.",
    accent: "forest",
  },
];

export function LandingFeatures() {
  return (
    <section id="caracteristicas" className="py-20 md:py-28 bg-background scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-sage mb-3">
            Lo que incluye
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">
            El ciclo de inocuidad que ya corre en Nura.
          </h2>
          <p className="mt-4 text-ink-light leading-relaxed">
            Plan, registros, auditoría, documentos y CAPA. Sin módulos que no
            existen y sin alta pública: te damos el acceso.
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
