import {
  PageHeaderSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from "@/components/page-skeleton";

export default function MacroTrendsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}
