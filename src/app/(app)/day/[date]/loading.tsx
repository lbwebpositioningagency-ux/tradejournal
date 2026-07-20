import {
  PageHeaderSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from "@/components/page-skeleton";

/** Skeleton della Day View: stat di giornata e tabella trade. */
export default function DayViewLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
