import Link from "next/link";
import type { ModuleKpiWidget } from "@/lib/dashboard/kpi-widgets";
import { cn } from "@/lib/utils";

interface ModuleKpiGridProps {
  widgets: ModuleKpiWidget[];
  compact?: boolean;
}

const STATUS_STYLES = {
  success: {
    ring: "border-sage/40",
    value: "text-sage",
    dot: "bg-sage",
  },
  warning: {
    ring: "border-amber/40",
    value: "text-amber",
    dot: "bg-amber",
  },
  danger: {
    ring: "border-danger/40",
    value: "text-danger",
    dot: "bg-danger",
  },
};

export function ModuleKpiGrid({ widgets, compact }: ModuleKpiGridProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        compact
          ? "grid-cols-2 lg:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      )}
    >
      {widgets.map((widget) => {
        const styles = STATUS_STYLES[widget.status];
        return (
          <Link
            key={widget.id}
            href={widget.href}
            className={cn(
              "bg-white rounded-md border-2 p-4 hover:bg-background transition-colors duration-150",
              styles.ring
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-ink-faint leading-snug">{widget.label}</p>
              <span
                className={cn("h-2 w-2 rounded-full shrink-0 mt-0.5", styles.dot)}
                aria-hidden
              />
            </div>
            <p
              className={cn(
                "text-3xl font-mono font-semibold mt-2",
                compact ? "text-2xl" : "text-3xl",
                styles.value
              )}
            >
              {widget.value}
            </p>
            <p className="text-xs text-ink-light mt-2 line-clamp-2">
              {widget.subtitle}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
