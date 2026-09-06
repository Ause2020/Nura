import Link from "next/link";
import type { OperationalMetrics } from "@/lib/dashboard/utils";
import { cn } from "@/lib/utils";
import { ComplianceRing } from "@/components/auditorias/compliance-ring";

interface MetricCardsProps {
  metrics: OperationalMetrics;
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const cards = [
    {
      label: "Plan HACCP",
      value: `${metrics.haccpComplete} de ${metrics.haccpTotal}`,
      sub: "pasos con checklist completo",
      href: "/haccp",
      alert: metrics.haccpTotal > 0 && metrics.haccpComplete === 0,
    },
    {
      label: "Monitoreos activos",
      value: String(metrics.recordsTemplatesActive),
      sub: `${metrics.recordsSubmissionsMonth} este mes`,
      href: "/registros",
      alert: metrics.recordsTemplatesActive === 0,
    },
    {
      label: "NCs abiertas",
      value: String(metrics.openNcs),
      sub:
        metrics.criticalOrOverdueNcs > 0
          ? `${metrics.criticalOrOverdueNcs} críticas/vencidas`
          : "sin alertas críticas",
      href: "/capa",
      alert: metrics.criticalOrOverdueNcs > 0,
    },
    {
      label: "Auditorías",
      value: `${metrics.auditsCompletedMonth}/${metrics.auditsScheduledMonth}`,
      sub: "completadas este mes",
      href: "/auditorias",
      alert: false,
    },
    {
      label: "Score sistema",
      value: null,
      score: metrics.systemScore,
      sub: "promedio ponderado",
      href: "/dashboard",
      alert: metrics.systemScore < 60,
    },
    {
      label: "CAPAs vencidas",
      value: String(metrics.overdueCapas),
      sub: "acciones fuera de plazo",
      href: "/capa",
      alert: metrics.overdueCapas > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className="bg-white rounded-md border border-border p-3 hover:bg-background transition-colors duration-150"
        >
          <p className="text-xs text-ink-faint">{card.label}</p>
          <div className="mt-1 flex items-center gap-2">
            {card.score !== undefined && card.score !== null ? (
              <ComplianceRing score={card.score} size={40} strokeWidth={3} />
            ) : (
              <p
                className={cn(
                  "text-xl font-mono font-semibold",
                  card.alert ? "text-danger" : "text-ink"
                )}
              >
                {card.value}
              </p>
            )}
          </div>
          <p className="text-xs text-ink-light mt-1">{card.sub}</p>
        </Link>
      ))}
    </div>
  );
}
