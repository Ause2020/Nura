import { Skeleton } from "@/components/ui/skeleton";

export default function HaccpLoading() {
  return (
    <div className="px-6 py-6 space-y-5">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-3 w-56" />
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>
      <div className="bg-white rounded-md border border-border p-5 space-y-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
