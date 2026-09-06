import { cn } from "@/lib/utils";
import { getCompletionBarColor } from "@/lib/haccp/constants";

interface CompletionBarProps {
  percent: number;
  className?: string;
  showLabel?: boolean;
}

export function CompletionBar({
  percent,
  className,
  showLabel = false,
}: CompletionBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden min-w-[60px]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-150",
            getCompletionBarColor(clamped)
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono text-ink-light w-8 text-right">
          {clamped}%
        </span>
      )}
    </div>
  );
}
