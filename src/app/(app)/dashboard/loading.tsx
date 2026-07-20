import {
  ChartCardSkeleton,
  PageHeaderSkeleton,
  StatGridSkeleton,
} from "@/components/page-skeleton";

/** Skeleton della dashboard: rispecchia la griglia reale dei widget. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <StatGridSkeleton cards={8} />
      <StatGridSkeleton cards={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCardSkeleton />
        <div className="lg:col-span-2">
          <ChartCardSkeleton />
        </div>
      </div>
    </div>
  );
}
