import {
  CardSkeleton,
  ModuleLoadingHeader,
  Skeleton,
} from "@/components/ui/skeleton";

export default function AnalisisLoading() {
  return (
    <div>
      <ModuleLoadingHeader titleWidth="w-24" descriptionWidth="w-72" />
      <div className="px-6 py-4 space-y-6 max-w-5xl">
        <div className="rounded-md border border-border bg-white p-5 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-3/4 max-w-lg" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <div className="bg-white rounded-md border border-border divide-y divide-border">
            <div className="px-4 py-3 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
            <div className="px-4 py-3 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-5/6" />
            </div>
            <div className="px-4 py-3 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
