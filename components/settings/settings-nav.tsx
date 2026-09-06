"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_NAV } from "@/lib/settings/constants";

interface SettingsNavProps {
  className?: string;
}

export function SettingsNav({ className }: SettingsNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("space-y-1", className)}>
      {SETTINGS_NAV.map(({ href, label, description, icon: Icon }) => {
        const isActive =
          pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-start gap-3 px-3 py-2.5 rounded-md border transition-colors duration-150",
              isActive
                ? "bg-sage-light border-sage/30 text-forest"
                : "border-transparent text-ink-light hover:bg-background hover:border-border"
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="text-xs text-ink-faint mt-0.5">{description}</p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
