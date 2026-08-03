"use client";

import dynamic from "next/dynamic";
import { CHART } from "@/components/charts/chart-spec";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * P-01 — versioni lazy dei grafici Recharts: il chunk recharts+d3 (~110 kB
 * gz) esce dal bundle iniziale delle route che li usano e si scarica DOPO
 * l'idratazione, fuori dal percorso di prima interazione. `ssr:false` deve
 * vivere in un client module (regola Next), per questo il wrapper è un file
 * a parte: le pagine server (es. /trades) importano da qui.
 *
 * Il fallback ha la STESSA altezza del grafico (CHART.height): nessun
 * layout shift allo swap skeleton → grafico.
 */
function ChartFallback() {
  return <Skeleton className="w-full" style={{ height: CHART.height }} />;
}

export const TradeSequenceChart = dynamic(
  () => import("./trade-sequence-chart").then((m) => m.TradeSequenceChart),
  { ssr: false, loading: () => <ChartFallback /> },
);

export const RDistributionChart = dynamic(
  () => import("./r-distribution-chart").then((m) => m.RDistributionChart),
  { ssr: false, loading: () => <ChartFallback /> },
);

export const UnderwaterChart = dynamic(
  () => import("./underwater-chart").then((m) => m.UnderwaterChart),
  { ssr: false, loading: () => <ChartFallback /> },
);

/* Il percorso stagionale è più alto degli altri grafici (una banda di
   dispersione dentro CHART.height sarebbe illeggibile): il suo fallback ha la
   stessa altezza maggiorata, altrimenti lo swap sposterebbe la pagina. */
export const SeasonalPathChart = dynamic(
  () =>
    import("../seasonality/path-chart").then((m) => m.SeasonalPathChart),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="w-full" style={{ height: CHART.height + 80 }} />
    ),
  },
);
