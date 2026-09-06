import { Reveal } from "@/components/landing/reveal";

const TESTIMONIALS = [
  {
    quote:
      "Antes llevábamos el HACCP en tres archivos distintos. Con Nura, el auditor entró, pidió el plan y lo tuvimos en pantalla en segundos.",
    name: "María González",
    role: "Jefa de Calidad",
    company: "Lácteos del Sur",
    country: "Chile",
    initials: "MG",
  },
  {
    quote:
      "Mis operadores completan el monitoreo de PCC desde el celular. Por primera vez tengo todo el mismo día, no una semana después.",
    name: "Carlos Méndez",
    role: "Director de Planta",
    company: "Conservas Andinas",
    country: "Colombia",
    initials: "CM",
  },
  {
    quote:
      "Las NC ya no se pierden en correos. El escalamiento automático de CAPA nos salvó en la última auditoría de cliente.",
    name: "Ana Ribeiro",
    role: "Ing. de Inocuidad",
    company: "Panificadora Nova",
    country: "Brasil",
    initials: "AR",
  },
];

export function LandingTestimonials() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-sage mb-3">
            Equipos de inocuidad
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">
            Hecho para la planta, no para el escritorio.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 100}>
              <blockquote className="h-full bg-white border border-border rounded-lg p-6 flex flex-col">
                <p className="text-sm text-ink-light leading-relaxed flex-1">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <footer className="mt-6 pt-5 border-t border-border flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-sage-light flex items-center justify-center text-xs font-mono font-medium text-forest">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{t.name}</p>
                    <p className="text-xs text-ink-faint">
                      {t.role} · {t.company}, {t.country}
                    </p>
                  </div>
                </footer>
              </blockquote>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
