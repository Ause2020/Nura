import {
  CardSkeleton,
  ModuleLoadingHeader,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function AuditoriasLoading() {
  return (
    <div>
      <ModuleLoadingHeader titleWidth="w-28" descriptionWidth="w-64" />
      <div className="px-6 py-3 flex gap-2 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="px-6 py-4 space-y-8">
        <section className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </section>
        <section className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <TableSkeleton rows={4} />
        </section>
      </div>
    </div>
  );
}
