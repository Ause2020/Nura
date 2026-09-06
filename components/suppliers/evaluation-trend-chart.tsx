"use client";

interface EvaluationTrendChartProps {
  scores: number[];
  labels: string[];
}

export function EvaluationTrendChart({
  scores,
  labels,
}: EvaluationTrendChartProps) {
  if (scores.length === 0) return null;

  const width = 320;
  const height = 120;
  const pad = { top: 12, right: 12, bottom: 24, left: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const yMin = 0;
  const yMax = 100;

  const xScale = (i: number) =>
    pad.left + (i / Math.max(scores.length - 1, 1)) * innerW;
  const yScale = (v: number) =>
    pad.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const path = scores
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(s)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-sm h-auto">
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={yScale(85)}
        y2={yScale(85)}
        stroke="#40916C"
        strokeDasharray="3 3"
        opacity={0.4}
      />
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={yScale(70)}
        y2={yScale(70)}
        stroke="#B7791F"
        strokeDasharray="3 3"
        opacity={0.4}
      />
      <path d={path} fill="none" stroke="#1B4332" strokeWidth={2} />
      {scores.map((s, i) => (
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(s)} r={4} fill="#40916C" />
          <text
            x={xScale(i)}
            y={height - 4}
            textAnchor="middle"
            fontSize={8}
            fill="#A09890"
            fontFamily="monospace"
          >
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
