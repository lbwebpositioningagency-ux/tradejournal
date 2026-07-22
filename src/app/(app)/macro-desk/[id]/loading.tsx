import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/page-skeleton";

export default function MacroReportLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <Skeleton className="h-11 w-full max-w-xl rounded-lg" />
      <StatGridSkeleton cards={3} />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
