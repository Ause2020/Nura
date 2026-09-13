import {
  CardSkeleton,
  ModuleLoadingHeader,
  Skeleton,
} from "@/components/ui/skeleton";

export default function RegistrosLoading() {
  return (
    <div>
      <ModuleLoadingHeader titleWidth="w-28" descriptionWidth="w-80" />
      <div className="px-6 py-3 flex gap-2 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="px-6 py-6 grid gap-4 sm:grid-cols-2 max-w-5xl">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
