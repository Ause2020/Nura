import { Reveal } from "@/components/landing/reveal";

const USES = [
  {
    title: "El monitor no necesita usuario",
    body: "Generas un QR del formulario, lo dejas en el puesto y el operador carga lote y valores desde el celular. El registro entra al histórico de la empresa.",
    tag: "QR en terreno",
  },
  {
    title: "El papel que ya tienen",
    body: "Si la línea sigue en planilla, la fotografían, Nura lee los campos y tú confirmas antes de que pase al histórico. Misma tabla que el QR y el formulario.",
    tag: "Digitalizar",
  },
  {
    title: "La desviación no se pierde",
    body: "Un valor fuera de rango o un hallazgo de auditoría abre la NC. CAPA sigue por etapas: contención, causa raíz y acciones, con el dato ya en la ficha.",
    tag: "CAPA",
  },
];

export function LandingTestimonials() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-sage mb-3">
            En la planta
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">
            Hecho para el turno, no para el escritorio.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {USES.map((item, i) => (
            <Reveal key={item.title} delay={i * 100}>
              <article className="h-full bg-white border border-border rounded-lg p-6 flex flex-col">
                <p className="text-[10px] font-mono uppercase tracking-wider text-sage">
                  {item.tag}
                </p>
                <h3 className="mt-3 text-sm font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-ink-light leading-relaxed flex-1">
                  {item.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
