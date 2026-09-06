"use client";

import { ArrowRight, Play } from "lucide-react";
import { ModuleCarousel } from "@/components/landing/module-carousel";

export function LandingHero() {
  return (
    <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden bg-ink">
      <div className="nura-hero-mesh absolute inset-0" aria-hidden="true" />
      <div className="nura-hero-grain absolute inset-0 opacity-[0.35]" aria-hidden="true" />

      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-forest/40 blur-[100px] nura-orb-drift" />
      <div className="absolute bottom-1/4 -right-24 w-80 h-80 rounded-full bg-sage/25 blur-[90px] nura-orb-drift-reverse" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-16 md:pt-32 md:pb-24 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <p className="nura-hero-text-delay-1 inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-sage mb-6">
              <span className="h-px w-8 bg-sage/60" />
              Software de inocuidad alimentaria
            </p>

            <h1 className="nura-hero-text-delay-2 font-display text-[2.5rem] sm:text-5xl lg:text-[3.25rem] font-semibold text-white leading-[1.08] tracking-tight">
              Tu inocuidad,
              <br />
              <span className="text-sage-light">finalmente clara.</span>
            </h1>

            <p className="nura-hero-text-delay-3 mt-6 text-base sm:text-lg text-white/65 leading-relaxed max-w-xl mx-auto lg:mx-0 font-light">
              Nura centraliza tu plan HACCP, monitoreo de PCC, auditorías,
              documentos y no conformidades en un solo lugar. Hecho por ingenieros
              de inocuidad, para ingenieros de inocuidad.
            </p>

            <div className="nura-hero-text-delay-4 mt-8 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3">
              <a
                href="#precios"
                className="group inline-flex h-11 px-6 items-center gap-2 text-sm font-semibold rounded-md bg-sage text-white hover:bg-sage/90 transition-all duration-300 shadow-[0_0_40px_-8px_rgba(64,145,108,0.7)] hover:shadow-[0_0_48px_-6px_rgba(64,145,108,0.85)] hover:-translate-y-0.5"
              >
                Solicitar acceso
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </a>
              <a
                href="#plataforma"
                className="inline-flex h-11 px-6 items-center gap-2 text-sm font-medium rounded-md border border-white/20 text-white/85 hover:bg-white/5 hover:border-white/30 transition-all duration-300"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Ver la plataforma
              </a>
            </div>

            <p className="nura-hero-text-delay-5 mt-6 text-xs text-white/40 font-mono">
              HACCP · Documentos · Monitoreo · Auditorías · CAPA.
            </p>
          </div>

          <div id="plataforma" className="nura-hero-text-delay-4 lg:pl-4 scroll-mt-28">
            <ModuleCarousel />
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 inset-x-0 flex justify-center nura-scroll-hint">
        <a
          href="#confianza"
          className="flex flex-col items-center gap-2 text-white/30 hover:text-white/50 transition-colors"
          aria-label="Desplazarse"
        >
          <span className="text-[10px] font-mono uppercase tracking-widest">
            Scroll
          </span>
          <span className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        </a>
      </div>
    </section>
  );
}
