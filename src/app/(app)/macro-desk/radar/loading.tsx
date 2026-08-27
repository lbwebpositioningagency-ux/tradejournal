import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

export default function MacroRadarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
