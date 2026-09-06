import { Reveal } from "@/components/landing/reveal";

const STANDARDS = [
  { code: "HACCP", label: "Codex Alimentarius" },
  { code: "ISO 22000", label: "Sistema de gestión" },
  { code: "BRC", label: "BRCGS Food Safety" },
  { code: "FSMA", label: "FDA Food Safety" },
  { code: "FSSC", label: "22000 v6" },
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
            Diseñado para alinear con los requisitos de
          </p>
        </Reveal>

        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
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
