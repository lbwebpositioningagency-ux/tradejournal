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
/**
 * `extra` = pixel in più rispetto all'altezza standard, per i grafici che
 * ne dichiarano una diversa (le rolling disegnano `CHART.height + 28` per
 * fare posto alla legenda interattiva).
 */
function ChartFallback({ extra = 0 }: { extra?: number }) {
  return (
    <Skeleton className="w-full" style={{ height: CHART.height + extra }} />
  );
}

/** Le due rolling aggiungono 28px al contenitore: v. rolling-charts.tsx. */
const ROLLING_EXTRA = 28;

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

/* ── /analytics ────────────────────────────────────────────────────────────
   T-1 — la Fase 52 aveva applicato il lazy-load solo a /trades e /dashboard,
   dichiarando le altre route fuori ambito. Il risultato misurato un mese
   dopo: /analytics era diventata la route più pesante dell'app (267 kB gz
   contro i 254 della dashboard), perché importa i suoi sei grafici in modo
   diretto e si porta dentro recharts+d3 (103 kB gz) più i chunk delle
   famiglie di grafico che usa solo lei (scatter, line).

   Nessuno di questi sta sopra la piega: la pagina si apre su intestazione,
   filtri, mappa delle ancore e riga di copertura del campione. I fallback
   hanno l'altezza vera di ciò che sostituiscono — è la condizione perché lo
   swap non sposti nulla (CLS = 0, la stessa verifica della Fase 52). */

export const RollingRatioChart = dynamic(
  () => import("../analytics/rolling-charts").then((m) => m.RollingRatioChart),
  { ssr: false, loading: () => <ChartFallback extra={ROLLING_EXTRA} /> },
);

export const RollingTradeChart = dynamic(
  () => import("../analytics/rolling-charts").then((m) => m.RollingTradeChart),
  { ssr: false, loading: () => <ChartFallback extra={ROLLING_EXTRA} /> },
);

export const SegmentPerformanceChart = dynamic(
  () =>
    import("../analytics/segment-performance-chart").then(
      (m) => m.SegmentPerformanceChart,
    ),
  { ssr: false, loading: () => <ChartFallback /> },
);

export const StreakDistributionChart = dynamic(
  () =>
    import("../analytics/streak-distribution-chart").then(
      (m) => m.StreakDistributionChart,
    ),
  { ssr: false, loading: () => <ChartFallback /> },
);

/* Il simulatore non è solo un grafico: è un form con sei campi più l'area
   disegnata (348px) più legenda e statistiche. Lo scheletro riproduce quella
   struttura, non un rettangolo unico, altrimenti allo swap la card cambia
   altezza di parecchie centinaia di pixel. */
export const EquitySimulator = dynamic(
  () => import("../analytics/equity-simulator").then((m) => m.EquitySimulator),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-30" />
          ))}
        </div>
        <Skeleton className="w-full" style={{ height: 348 }} />
      </div>
    ),
  },
);

/* Il percorso stagionale è molto più alto degli altri grafici: un anno di
   pendenze schiacciato in 300px non si legge. L'altezza vera la fissa il
   wrapper in pagina (h-[340px] md:h-[460px]); il fallback riempie lo stesso
   wrapper, così lo swap skeleton → grafico non sposta niente. */
export const SeasonalPathChart = dynamic(
  () =>
    import("../seasonality/path-chart").then((m) => m.SeasonalPathChart),
  {
    ssr: false,
    loading: () => <Skeleton className="size-full" />,
  },
);

export const HourPathChart = dynamic(
  () =>
    import("../seasonality/hour-path-chart").then((m) => m.HourPathChart),
  {
    ssr: false,
    loading: () => <Skeleton className="size-full" />,
  },
);
