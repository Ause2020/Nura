"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#plataforma", label: "Plataforma" },
  { href: "#caracteristicas", label: "Características" },
  { href: "#precios", label: "Precios" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-ink/85 backdrop-blur-md border-b border-white/10 shadow-lg shadow-ink/20"
          : "bg-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-lg font-semibold text-white tracking-tight shrink-0"
        >
          Nura<span className="text-sage">.</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-white/70 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
          <span className="text-sm text-white/30 cursor-default">Blog</span>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href="/login"
            className="hidden sm:inline-flex h-9 px-4 items-center text-sm font-medium text-white/80 hover:text-white transition-colors duration-200"
          >
            Iniciar sesión
          </Link>
          <a
            href="#precios"
            className="inline-flex h-9 px-4 items-center text-sm font-medium rounded-md bg-sage text-white hover:bg-sage/90 transition-colors duration-200 shadow-[0_0_24px_-4px_rgba(64,145,108,0.55)]"
          >
            Solicitar acceso
          </a>
        </div>
      </div>
    </header>
  );
}
