import {
  RADAR_LEVELS,
  radarPoint,
  radarPolygonPoints,
  truncateRadarLabel,
} from "@/lib/audit/radar";

interface RadarChartProps {
  data: { section: string; score: number }[];
  size?: number;
  emptyLabel?: string;
}

export function RadarChart({
  data,
  size = 280,
  emptyLabel = "Sin datos para gráfica",
}: RadarChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-ink-faint text-center py-8">{emptyLabel}</p>
    );
  }

  const center = size / 2;
  const maxRadius = size / 2 - 40;
  const dataPoints = radarPolygonPoints(
    data.map((d) => d.score),
    center,
    maxRadius
  );

  return (
    <svg width={size} height={size} className="mx-auto" viewBox={`0 0 ${size} ${size}`}>
      {RADAR_LEVELS.map((level) => (
        <polygon
          key={level}
          points={radarPolygonPoints(
            data.map(() => level),
            center,
            maxRadius
          )}
          fill="none"
          stroke="#E2DDD6"
          strokeWidth={1}
        />
      ))}

      {data.map((_, i) => {
        const [x, y] = radarPoint(i, 100, data.length, center, maxRadius);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="#E2DDD6"
            strokeWidth={1}
          />
        );
      })}

      <polygon
        points={dataPoints}
        fill="rgba(64, 145, 108, 0.2)"
        stroke="#40916C"
        strokeWidth={2}
      />

      {data.map((d, i) => {
        const [x, y] = radarPoint(i, 118, data.length, center, maxRadius);
        return (
          <text
            key={`${d.section}-${i}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-ink-light text-[9px]"
          >
            {truncateRadarLabel(d.section)}
          </text>
        );
      })}
    </svg>
  );
}
