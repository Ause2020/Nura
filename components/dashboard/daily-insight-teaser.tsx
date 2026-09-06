import Link from "next/link";
import { ArrowRight, BrainCircuit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DailyInsight, InsightRisk } from "@/lib/ai-insights/types";
import { cn } from "@/lib/utils";

const RISK_VARIANT: Record<InsightRisk, "success" | "warning" | "danger"> = {
  ok: "success",
  attention: "warning",
  critical: "danger",
};

const RISK_TONE: Record<InsightRisk, string> = {
  ok: "border-sage/40",
  attention: "border-amber/40",
  critical: "border-danger/40",
};

const RISK_LABEL: Record<InsightRisk, string> = {
  ok: "Bajo control",
  attention: "Requiere atención",
  critical: "Crítico",
};

interface DailyInsightTeaserProps {
  insight: Pick<DailyInsight, "headline" | "summary" | "overallRisk">;
}

export function DailyInsightTeaser({ insight }: DailyInsightTeaserProps) {
  return (
    <Link
      href="/analisis"
      className={cn(
        "block bg-white rounded-md border-2 p-4 hover:bg-background transition-colors",
        RISK_TONE[insight.overallRisk]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BrainCircuit className="h-4 w-4 text-forest shrink-0" />
          <p className="text-xs font-mono uppercase tracking-wider text-ink-faint">
            Análisis de hoy
          </p>
          <Badge variant={RISK_VARIANT[insight.overallRisk]} showDot={false}>
            {RISK_LABEL[insight.overallRisk]}
          </Badge>
        </div>
        <ArrowRight className="h-4 w-4 text-ink-faint shrink-0" />
      </div>
      <p className="text-sm font-semibold text-ink mt-2 tracking-tight">
        {insight.headline}
      </p>
      <p className="text-xs text-ink-light mt-1 line-clamp-2 leading-relaxed">
        {insight.summary}
      </p>
    </Link>
  );
}
