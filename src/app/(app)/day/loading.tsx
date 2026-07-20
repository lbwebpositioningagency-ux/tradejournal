import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/page-skeleton";

/** Skeleton del calendario: griglia 7+1 colonne come la vista reale. */
export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="rounded-xl border bg-card p-4">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_4.5rem] gap-1">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={`h-${i}`} className="h-4 w-full" />
          ))}
          {Array.from({ length: 40 }, (_, i) => (
            <Skeleton key={i} className="min-h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
