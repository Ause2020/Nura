import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-zinc-100", className)}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-md border border-border p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function ModuleLoadingHeader({
  titleWidth = "w-36",
  descriptionWidth = "w-56",
}: {
  titleWidth?: string;
  descriptionWidth?: string;
}) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4">
      <Skeleton className={cn("h-4", titleWidth)} />
      <Skeleton className={cn("mt-2 h-3", descriptionWidth)} />
    </header>
  );
}
