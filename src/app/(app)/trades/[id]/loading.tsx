import { PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

/**
 * Scheletro del dettaglio (e della modifica). Sta sotto `layout.tsx`, che ha
 * già verificato che il trade esista: lo streaming parte dopo il controllo.
 */
export default function TradeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
