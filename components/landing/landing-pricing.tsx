import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const INCLUDED = [
  "Plan HACCP ilimitado con árbol de decisiones",
  "Monitoreo de PCC con plantillas configurables",
  "Control documental con versiones y firmas",
  "Auditorías con informe automático",
  "CAPA con análisis de causa raíz (5 Porqués e Ishikawa)",
  "Dashboard operativo y ejecutivo",
  "Hasta 10 usuarios con roles (admin, calidad, operador)",
  "Notificaciones y alertas por email",
  "Exportación de datos (JSON)",
  "Soporte en español",
];

const COMPARE = [
  { feature: "Plan HACCP digital", nura: true, other: "Excel / Word" },
  { feature: "Monitoreo de PCC", nura: true, other: "Papel / Excel" },
  { feature: "Control documental versionado", nura: true, other: false },
  { feature: "Auditorías con fotos", nura: true, other: false },
  { feature: "CAPA con seguimiento", nura: true, other: "Manual" },
  { feature: "Alertas automáticas", nura: true, other: false },
  { feature: "Multi-usuario con roles", nura: true, other: false },
  { feature: "Tiempo de implementación", nura: "Días", other: "Meses" },
];

export function LandingPricing() {
  return (
    <section id="precios" className="py-20 md:py-28 bg-ink text-white scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-sage mb-3">
            Precios
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Un plan. Todo incluido.
          </h2>
          <p className="mt-4 text-white/60 leading-relaxed">
            Acceso activado tras contrato. Sin sorpresas, sin módulos ocultos.
          </p>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <Reveal delay={100}>
            <div className="relative rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-sage/20 blur-[80px] rounded-full" />
              <div className="relative">
                <p className="text-xs font-mono uppercase tracking-wider text-sage">
                  Plan Nura
                </p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-5xl font-semibold">$79</span>
                  <span className="text-white/50 text-sm">/mes</span>
                </div>
                <p className="mt-2 text-sm text-white/55">
                  Por organización · facturación anual disponible
                </p>

                <ul className="mt-8 space-y-3">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/80">
                      <Check className="h-4 w-4 text-sage shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-6 border-t border-white/10">
                  <p className="text-xs text-white/45 mb-4">
                    El acceso se activa manualmente tras firmar contrato. Te
                    entregamos credenciales en persona.
                  </p>
                  <a
                    href="mailto:hola@nurahq.com?subject=Solicitud%20de%20acceso%20Nura"
                    className="inline-flex h-11 w-full items-center justify-center text-sm font-semibold rounded-md bg-sage text-white hover:bg-sage/90 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Solicitar acceso
                  </a>
                  <Link
                    href="/login"
                    className="mt-3 inline-flex h-10 w-full items-center justify-center text-sm text-white/70 hover:text-white transition-colors"
                  >
                    ¿Ya tienes credenciales? Inicia sesión
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5">
                <p className="text-sm font-medium">¿Por qué no seguir con Excel?</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-mono uppercase tracking-wider text-white/40">
                    <th className="px-6 py-3 font-medium">Capacidad</th>
                    <th className="px-4 py-3 font-medium text-sage">Nura</th>
                    <th className="px-4 py-3 font-medium">Tradicional</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row.feature} className="border-t border-white/5">
                      <td className="px-6 py-3 text-white/75">{row.feature}</td>
                      <td className="px-4 py-3">
                        {row.nura === true ? (
                          <Check className="h-4 w-4 text-sage" />
                        ) : (
                          <span className="font-mono text-sage text-xs">
                            {row.nura}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/40">
                        {row.other === false ? (
                          <Minus className="h-4 w-4" />
                        ) : (
                          <span className="text-xs">{row.other}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
