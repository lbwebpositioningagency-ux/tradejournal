import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

export default function AiAnalystLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}
