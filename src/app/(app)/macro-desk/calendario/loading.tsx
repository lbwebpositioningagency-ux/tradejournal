import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

export default function MacroCalendarioLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={12} />
    </div>
  );
}
