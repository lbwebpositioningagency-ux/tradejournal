import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

/** Skeleton della Trade View: testata, barra filtri e tabella. */
export default function TradesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <TableSkeleton rows={10} />
    </div>
  );
}
