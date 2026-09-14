import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

/**
 * Scheletro generico, lo stesso che prima arrivava da `(app)/loading.tsx`.
 * Quel file è stato tolto: stando sopra tutte le pagine, faceva partire lo
 * streaming prima di qualunque `notFound()` e ogni 404 rispondeva 200.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
