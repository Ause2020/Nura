"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/trazabilidad", label: "Lotes" },
  { href: "/trazabilidad/simulacro", label: "Simulacros de retiro" },
  { href: "/trazabilidad/ejercicio", label: "Ejercicio de Trazabilidad" },
];

export function TraceabilityNavTabs() {
  const pathname = usePathname();

  return (
    <div className="px-6 pt-2 flex flex-wrap gap-2 border-b border-border">
      {LINKS.map((link) => {
        const active =
          link.href === "/trazabilidad"
            ? pathname === "/trazabilidad" ||
              pathname.startsWith("/trazabilidad/lotes")
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-forest text-forest"
                : "border-transparent text-ink-light hover:text-ink"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
