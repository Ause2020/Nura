import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function AnalisisLoading() {
  return (
    <div className="px-6 py-4 space-y-6 max-w-5xl">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
      <CardSkeleton />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <CardSkeleton />
    </div>
  );
}
