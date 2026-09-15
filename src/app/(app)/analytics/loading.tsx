import { PageHeaderSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton di Analytics con la GEOMETRIA della pagina: filtri, sintesi delle
 * cinque metriche (stessa griglia senza orfani), indice a sinistra da 1024px e
 * pannelli due per riga da 1280px. Prima erano quattro card-grafico impilate.
 */
export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="overflow-hidden rounded-xl border">
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn("bg-card p-4", i === 4 && "sm:col-span-2 xl:col-span-1")}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden flex-col gap-2 lg:flex">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
              <Skeleton className="mt-4 h-56 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
