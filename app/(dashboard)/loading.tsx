import { ModuleLoadingHeader, Skeleton } from "@/components/ui/skeleton";

export default function DashboardGroupLoading() {
  return (
    <div>
      <ModuleLoadingHeader />
      <div className="px-6 py-4 space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
