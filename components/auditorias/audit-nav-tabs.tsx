"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/auditorias", label: "Programa" },
  { href: "/auditorias/calendario", label: "Calendario" },
  { href: "/auditorias/plantillas", label: "Plantillas" },
  { href: "/auditorias/tendencias", label: "Tendencias" },
];

export function AuditNavTabs() {
  const pathname = usePathname();

  return (
    <div className="px-6 pt-2 flex flex-wrap gap-2 border-b border-border">
      {LINKS.map((link) => {
        const active =
          link.href === "/auditorias"
            ? pathname === "/auditorias"
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
