import type { NcOriginCount } from "@/lib/dashboard/utils";

interface NcOriginChartProps {
  data: NcOriginCount[];
}

export function NcOriginChart({ data }: NcOriginChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-ink-faint py-4 text-center">Sin NCs registradas</p>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <div className="space-y-2">
      {sorted.map((item) => (
        <div key={item.origin} className="flex items-center gap-2">
          <span className="text-xs text-ink-light w-20 truncate shrink-0">
            {item.label}
          </span>
          <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-sage rounded-full transition-all duration-500"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-ink-faint w-4 text-right">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}
