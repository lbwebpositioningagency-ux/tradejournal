import { Skeleton } from "@/components/ui/skeleton";

/**
 * Blocchi skeleton condivisi (FASE 10): un solo linguaggio di caricamento
 * in tutta l'app — niente spinner generici.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-44" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export function StatGridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cards }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-52 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/40 p-3">
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-b p-3 last:border-b-0">
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
