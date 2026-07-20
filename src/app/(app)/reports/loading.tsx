import {
  ChartCardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/page-skeleton";

/** Skeleton dei Reports: due tabelle e due grafici, come la pagina reale. */
export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={4} />
      <TableSkeleton rows={6} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}
