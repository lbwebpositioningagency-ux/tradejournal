import { PageHeaderSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Caricamento della Scorecard con la geometria della pagina: striscia dello
 * stato in tre celle, consuntivo a quattro righe, tabella delle settimane a
 * righe da 28px.
 */
export default function MacroScorecardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-5 border border-border p-4 sm:p-6">
        <div className="grid gap-4 border-y border-border py-3 sm:grid-cols-[2fr_1fr_1fr]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-full max-w-72" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
