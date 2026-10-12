import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const PRO_INCLUDED = [
  "Una organización y una planta",
  "Plan HACCP de 12 pasos (Codex / NCh 2861)",
  "Monitoreo: plantillas, formulario, QR en terreno y digitalizar papel",
  "Histórico de registros y desviaciones que abren NC",
  "Auditorías internas con fotos, hallazgos e informe PDF",
  "CAPA con 5 Porqués e Ishikawa",
  "Control documental con versiones y aprobación",
  "Dashboard y roles (admin, calidad, operador)",
  "Notificaciones por email y exportación JSON",
  "Alta manual: te creamos empresa, usuario y clave inicial",
  "Soporte en español",
];

const CUSTOM_INCLUDED = [
  "Varias plantas u organizaciones",
  "Mayor volumen de registros, documentos y usuarios",
  "Acompañamiento de implementación y capacitación",
  "Plantillas y checklists a la medida de tu estándar",
  "Todo lo del plan Pro",
];

const COMPARE = [
  { feature: "Plan HACCP digital", nura: true, other: "Excel / Word" },
  { feature: "QR de monitoreo en planta", nura: true, other: "Papel" },
  { feature: "Digitalizar planillas existentes", nura: true, other: false },
  { feature: "Documentos versionados", nura: true, other: false },
  { feature: "Auditorías con fotos e informe", nura: true, other: false },
  { feature: "CAPA con seguimiento", nura: true, other: "Manual" },
  { feature: "Roles por usuario", nura: true, other: false },
  { feature: "Tiempo de puesta en marcha", nura: "Días", other: "Meses" },
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
            Pro a precio fijo. A medida, conversamos.
          </h2>
          <p className="mt-4 text-white/60 leading-relaxed">
            El cobro es directo (transferencia o factura). Nura no procesa pagos
            ni tiene alta pública: te damos el acceso al contratar.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          <Reveal delay={80}>
            <div className="relative h-full rounded-xl border border-sage/40 bg-white/5 backdrop-blur-sm p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-sage/20 blur-[80px] rounded-full" />
              <div className="relative flex flex-col h-full">
                <p className="text-xs font-mono uppercase tracking-wider text-sage">
                  Pro
                </p>
                <div className="mt-4">
                  <span className="font-display text-4xl font-semibold">Precio fijo</span>
                </div>
                <p className="mt-2 text-sm text-white/55">
                  Por organización · una planta. Te lo confirmamos al contratar.
                </p>

                <ul className="mt-8 space-y-3 flex-1">
                  {PRO_INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/80">
                      <Check className="h-4 w-4 text-sage shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-6 border-t border-white/10">
                  <a
                    href="mailto:hola@nurahq.com?subject=Quiero%20el%20plan%20Pro%20de%20Nura"
                    className="inline-flex h-11 w-full items-center justify-center text-sm font-semibold rounded-md bg-sage text-white hover:bg-sage/90 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Contratar Pro
                  </a>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="relative h-full rounded-xl border border-white/10 bg-white/[0.03] p-8">
              <div className="flex flex-col h-full">
                <p className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Personalizado
                </p>
                <div className="mt-4">
                  <span className="font-display text-4xl font-semibold">A medida</span>
                </div>
                <p className="mt-2 text-sm text-white/55">
                  Varias plantas, más volumen o implementación guiada
                </p>

                <ul className="mt-8 space-y-3 flex-1">
                  {CUSTOM_INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/80">
                      <Check className="h-4 w-4 text-sage shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-6 border-t border-white/10">
                  <a
                    href="mailto:hola@nurahq.com?subject=Consulta%20plan%20personalizado%20Nura"
                    className="inline-flex h-11 w-full items-center justify-center text-sm font-semibold rounded-md border border-white/25 text-white hover:bg-white/10 transition-all duration-300"
                  >
                    Consultar
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={220} className="mt-10 rounded-xl border border-white/10 overflow-hidden">
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
                      <span className="font-mono text-sage text-xs">{row.nura}</span>
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
        </Reveal>

        <p className="mt-8 text-center text-xs text-white/40">
          ¿Ya tienes credenciales?{" "}
          <Link href="/login" className="text-sage hover:text-white transition-colors">
            Inicia sesión
          </Link>
        </p>
      </div>
    </section>
  );
}
