import {
  PageHeaderSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from "@/components/page-skeleton";

export default function MacroDeskLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="grid gap-4 xl:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}
