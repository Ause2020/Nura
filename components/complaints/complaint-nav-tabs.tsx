"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/reclamos", label: "Reclamos" },
  { href: "/reclamos/tendencias", label: "Tendencias" },
];

export function ComplaintNavTabs() {
  const pathname = usePathname();

  return (
    <div className="px-6 pt-2 flex flex-wrap gap-2 border-b border-border">
      {LINKS.map((link) => {
        const active =
          link.href === "/reclamos"
            ? pathname === "/reclamos" || pathname.startsWith("/reclamos/nuevo")
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
