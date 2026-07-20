import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

/** Skeleton generico per le pagine senza uno dedicato (stesso linguaggio). */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
