import { cn } from "@/lib/utils";

export interface DayPoint {
  date: string;
  total: number;
  ok: number;
  deviations: number;
}

interface HistoricoChartsProps {
  days: DayPoint[];
}

function formatDay(iso: string): string {
  const [, , day] = iso.split("-");
  return day ?? iso;
}

export function HistoricoCharts({ days }: HistoricoChartsProps) {
  const maxVolume = Math.max(1, ...days.map((d) => d.total));
  const width = 520;
  const height = 140;
  const pad = { top: 12, right: 8, bottom: 22, left: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const compliancePoints = days.map((d, i) => {
    const x = pad.left + (i / Math.max(days.length - 1, 1)) * chartW;
    const pct = d.total === 0 ? 100 : Math.round((d.ok / d.total) * 100);
    const y = pad.top + chartH - (pct / 100) * chartH;
    return { x, y, pct, ...d };
  });

  const line = compliancePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-md border border-border p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint mb-3">
          Conformidad · 14 días
        </h3>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36">
          {[0, 50, 100].map((level) => {
            const y = pad.top + chartH - (level / 100) * chartH;
            return (
              <line
                key={level}
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="#E2DDD6"
                strokeDasharray={level === 50 ? "4 4" : undefined}
              />
            );
          })}
          <path d={line} fill="none" stroke="#1B4332" strokeWidth={2} />
          {compliancePoints.map((p) => (
            <circle key={p.date} cx={p.x} cy={p.y} r={2.5} fill="#40916C" />
          ))}
        </svg>
        <p className="text-xs text-ink-light">
          Último día:{" "}
          {compliancePoints[compliancePoints.length - 1]?.pct ?? 100}% conforme
        </p>
      </div>

      <div className="bg-white rounded-md border border-border p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint mb-3">
          Volumen y desviaciones
        </h3>
        <div className="flex items-end gap-1 h-36">
          {days.map((d) => {
            const h = (d.total / maxVolume) * 100;
            const devH = d.total > 0 ? (d.deviations / d.total) * h : 0;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col justify-end items-center gap-1 min-w-0"
                title={`${d.date}: ${d.total} · ${d.deviations} desv.`}
              >
                <div
                  className="w-full rounded-t-sm bg-sage-light relative overflow-hidden"
                  style={{ height: `${Math.max(h, d.total > 0 ? 8 : 2)}%` }}
                >
                  <div
                    className={cn("absolute bottom-0 inset-x-0 bg-danger/80")}
                    style={{ height: `${devH}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-ink-faint">
                  {formatDay(d.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
