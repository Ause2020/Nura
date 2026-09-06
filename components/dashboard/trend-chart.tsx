import type { MonthlyScorePoint } from "@/lib/dashboard/utils";
import { scoreColor } from "@/lib/dashboard/utils";

interface TrendChartProps {
  data: MonthlyScorePoint[];
  width?: number;
  height?: number;
}

export function TrendChart({ data, width = 320, height = 120 }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-ink-faint text-center py-8">Sin datos de tendencia</p>
    );
  }

  const padding = { top: 12, right: 8, bottom: 24, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padding.top + chartH - (d.score / 100) * chartH;
    return { x, y, ...d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const lastScore = data[data.length - 1]?.score ?? 0;

  return (
    <svg width={width} height={height} className="w-full max-w-sm mx-auto">
      {[0, 50, 100].map((level) => {
        const y = padding.top + chartH - (level / 100) * chartH;
        return (
          <line
            key={level}
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke="#E2DDD6"
            strokeWidth={1}
            strokeDasharray={level === 50 ? "4 4" : undefined}
          />
        );
      })}

      <path
        d={pathD}
        fill="none"
        stroke={scoreColor(lastScore)}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {points.map((p) => (
        <g key={p.month}>
          <circle cx={p.x} cy={p.y} r={3} fill={scoreColor(p.score)} />
          <text
            x={p.x}
            y={height - 4}
            textAnchor="middle"
            className="fill-ink-faint text-[9px] capitalize"
          >
            {p.month}
          </text>
        </g>
      ))}
    </svg>
  );
}
