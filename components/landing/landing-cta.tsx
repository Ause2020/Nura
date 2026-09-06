import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

export function LandingCta() {
  return (
    <section className="py-20 md:py-24 bg-forest relative overflow-hidden">
      <div className="absolute inset-0 nura-cta-rays opacity-30" aria-hidden="true" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <Reveal>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-white tracking-tight">
            Bienvenido a Nura.
          </h2>
          <p className="mt-4 text-sage-light/90 text-base leading-relaxed max-w-xl mx-auto">
            En 10 minutos tienes tu primer plan HACCP listo. Empecemos.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="mailto:hola@nurahq.com?subject=Solicitud%20de%20acceso%20Nura"
              className="group inline-flex h-11 px-6 items-center gap-2 text-sm font-semibold rounded-md bg-white text-forest hover:bg-sage-light transition-all duration-300 hover:-translate-y-0.5"
            >
              Solicitar acceso
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <Link
              href="/login"
              className="inline-flex h-11 px-6 items-center text-sm font-medium text-white/80 hover:text-white transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
