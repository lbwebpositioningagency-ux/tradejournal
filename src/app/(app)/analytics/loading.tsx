import {
  ChartCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/page-skeleton";

/**
 * Skeleton di Analytics (D-04): la pagina è una colonna di card-grafico e
 * lancia molte query — il fallback generico a tabella del gruppo (app)
 * produceva un "flash" di layout che non somiglia al contenuto reale.
 */
export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <ChartCardSkeleton />
      <ChartCardSkeleton />
      <ChartCardSkeleton />
      <ChartCardSkeleton />
    </div>
  );
}
