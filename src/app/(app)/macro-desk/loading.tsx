import { PageHeaderSkeleton, StatCardSkeleton } from "@/components/page-skeleton";

/**
 * L'indice non carica dati di mercato: lo scheletro ricalca la pagina, cioè le
 * quattro sezioni quotidiane in riga e sotto le due d'archivio, sulle stesse
 * colonne.
 */
export default function MacroDeskLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="mt-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 2 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
