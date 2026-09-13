import {
  CardSkeleton,
  ModuleLoadingHeader,
  Skeleton,
} from "@/components/ui/skeleton";

export default function DashboardSegmentLoading() {
  return (
    <div>
      <ModuleLoadingHeader titleWidth="w-28" descriptionWidth="w-56" />
      <div className="px-6 py-4 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="bg-white rounded-md border border-border p-6 flex flex-col md:flex-row items-center gap-8">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-2 w-full">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="h-3 w-3/4 max-w-sm" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}
