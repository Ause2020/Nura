import {
  ModuleLoadingHeader,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function CapaLoading() {
  return (
    <div>
      <ModuleLoadingHeader titleWidth="w-40" descriptionWidth="w-72" />
      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-md border border-border h-20 px-4 py-3 space-y-2"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
