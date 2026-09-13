import {
  ModuleLoadingHeader,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function DocumentosLoading() {
  return (
    <div>
      <ModuleLoadingHeader titleWidth="w-48" descriptionWidth="w-72" />
      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="bg-white border border-border rounded-md p-4">
          <TableSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}
