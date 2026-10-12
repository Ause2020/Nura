import { Reveal } from "@/components/landing/reveal";

const STANDARDS = [
  { code: "Codex", label: "HACCP 12 pasos" },
  { code: "NCh 2861", label: "Chile — sistema HACCP" },
  { code: "BRCGS", label: "Checklists de auditoría interna" },
];

export function LandingTrust() {
  return (
    <section
      id="confianza"
      className="py-14 md:py-16 bg-white border-y border-border"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal>
          <p className="text-center text-xs font-mono uppercase tracking-[0.18em] text-ink-faint mb-8">
            El plan y las auditorías siguen estos marcos. Nura no es un
            certificado.
          </p>
        </Reveal>

        <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
          {STANDARDS.map((std, i) => (
            <Reveal key={std.code} delay={i * 80} className="text-center">
              <p className="font-display text-xl md:text-2xl font-semibold text-forest tracking-tight">
                {std.code}
              </p>
              <p className="text-[10px] font-mono text-ink-faint mt-0.5">
                {std.label}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
