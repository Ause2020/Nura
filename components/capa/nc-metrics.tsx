import { cn } from "@/lib/utils";

interface NcMetricsProps {
  open: number;
  overdue: number;
  closedThisMonth: number;
  recurrenceRate: number;
}

export function NcMetrics({
  open,
  overdue,
  closedThisMonth,
  recurrenceRate,
}: NcMetricsProps) {
  const cards = [
    {
      label: "No conformidades",
      sub: "Abiertas",
      value: open,
      valueClass: "text-ink",
    },
    {
      label: "Vencidas",
      sub: "Requieren atención",
      value: overdue,
      valueClass: overdue > 0 ? "text-danger" : "text-ink",
    },
    {
      label: "Cerradas",
      sub: "Este mes",
      value: closedThisMonth,
      valueClass: "text-sage",
    },
    {
      label: "Reincidencia",
      sub: "Del mes (%)",
      value: `${recurrenceRate}%`,
      valueClass: recurrenceRate > 20 ? "text-amber" : "text-ink",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.sub}
          className="bg-white rounded-md border border-border h-20 px-4 py-3 flex flex-col justify-center"
        >
          <p className="text-xs text-ink-faint">{card.label}</p>
          <p className={cn("text-2xl font-mono font-semibold leading-tight", card.valueClass)}>
            {card.value}
          </p>
          <p className="text-xs text-ink-light">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
