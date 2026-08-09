import { PageHeaderSkeleton, StatCardSkeleton } from "@/components/page-skeleton";

/** L'indice non carica dati di mercato: lo scheletro è la griglia delle 8 sezioni. */
export default function MacroDeskLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
