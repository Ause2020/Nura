interface SystemScoreRingProps {
  score: number;
  size?: number;
}

export function SystemScoreRing({ score, size = 160 }: SystemScoreRingProps) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#40916C" : score >= 60 ? "#B7791F" : "#DC2626";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E2DDD6"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute text-center">
          <span className="text-3xl font-mono font-semibold text-ink">
            {score}
          </span>
          <span className="text-sm font-mono text-ink-faint">%</span>
        </div>
      </div>
      <p className="text-xs text-ink-faint mt-2 text-center max-w-[140px]">
        Score global del sistema de inocuidad
      </p>
    </div>
  );
}
