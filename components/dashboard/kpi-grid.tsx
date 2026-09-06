import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import type { ExecutiveKpi } from "@/lib/dashboard/utils";
import { cn } from "@/lib/utils";

interface KpiGridProps {
  kpis: ExecutiveKpi[];
}

const TREND_ICON = {
  up: ArrowUp,
  down: ArrowDown,
  flat: ArrowRight,
};

const TREND_COLOR = {
  up: "text-sage",
  down: "text-danger",
  flat: "text-ink-faint",
};

export function KpiGrid({ kpis }: KpiGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {kpis.map((kpi) => {
        const TrendIcon = TREND_ICON[kpi.trend];
        return (
          <div
            key={kpi.label}
            className="bg-white rounded-md border border-border p-4"
          >
            <p className="text-xs text-ink-faint">{kpi.label}</p>
            <p className="text-2xl font-mono font-semibold text-ink mt-1">
              {kpi.value}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <TrendIcon
                className={cn("h-3 w-3", TREND_COLOR[kpi.trend])}
              />
              <span className="text-xs text-ink-faint">{kpi.trendLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
