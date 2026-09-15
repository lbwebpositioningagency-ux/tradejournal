import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/page-skeleton";

/**
 * Caricamento della pagina Report con la GEOMETRIA della pagina vera: striscia
 * dello stato in tre celle, schede, quadro e tabella dei bias a righe da
 * 28px, tutto a piena larghezza. Dal 15/09/2026 l'archivio non occupa più
 * spazio nella pagina (è una tendina in testata): niente colonna, niente riga.
 */
export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="border border-border p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid gap-4 border-y border-border py-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-44" />
              </div>
            ))}
          </div>
          <Skeleton className="h-9 w-40" />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="h-16 w-full max-w-[80ch]" />
          <div className="flex flex-col gap-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
