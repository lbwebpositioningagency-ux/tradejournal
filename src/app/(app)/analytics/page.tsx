import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { resolvePeriod } from "@/lib/period";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { getCurrencyBreakdown } from "@/lib/queries/stats";
import {
  getAnalyticsSymbols,
  getPlanCoverage,
  getRHistogram,
  getTargetRBuckets,
  getTargetVsRealized,
  getHourPerformance,
  getDurationPerformance,
  type AnalyticsFilter,
} from "@/lib/queries/analytics";
import {
  DURATION_BUCKETS,
  bestAndWorst,
  durationPerformanceInfo,
  fillDurationSegments,
  fillHourSegments,
  hourPerformanceInfo,
} from "@/lib/metrics";
import { SegmentPerformanceChart } from "@/components/analytics/segment-performance-chart";
import { SegmentTable } from "@/components/analytics/segment-table";
import {
  targetRBucketStats,
  targetRTotals,
  returnDistributionInfo,
  hitRateInfo,
} from "@/lib/metrics/return-distribution";
import { fillRDistribution } from "@/lib/reports";
import { BE_BIN } from "@/lib/queries/stats";
import { formatPercent, formatRMultiple } from "@/lib/money";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import { BarChart3, Crosshair, Target } from "lucide-react";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { TargetRTable } from "@/components/analytics/target-r-table";
import { RDistributionChart } from "@/components/charts/r-distribution-chart";
import { TargetScatterChart } from "@/components/charts/target-scatter-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Analytics" };

/**
 * ANALYTICS — le analisi che non stanno in un widget.
 *
 * §3: distribuzione dei ritorni per target R. Le grandezze arrivano tutte
 * dalla stessa fonte di verità del resto dell'app (`rMultiple` e `targetR`
 * denormalizzati dalla pipeline): qui si aggrega e si mostra, non si
 * ricalcola.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sessionUserId = session.user.id;

  const [user, tradeScope, params] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUserId },
      select: { timezone: true, baseCurrency: true },
    }),
    resolveTradeScope(sessionUserId),
    searchParams,
  ]);
  const userId = tradeScope.userId;
  const accountId = tradeScope.accountId;

  const period = resolvePeriod(params, user.timezone);
  const base = { userId, accountId, from: period.from, to: period.to };

  // Stessa regola del resto dell'app: mai sommare valute diverse.
  const currencyTotals = await getCurrencyBreakdown(base);
  const currencyScope = resolveCurrencyScope(
    currencyTotals,
    typeof params.cur === "string" ? params.cur : undefined,
  );

  const symbol =
    typeof params.symbol === "string" && params.symbol
      ? params.symbol.toUpperCase().slice(0, 20)
      : undefined;
  const direction =
    params.dir === "LONG" || params.dir === "SHORT" ? params.dir : undefined;

  const filter: AnalyticsFilter = {
    ...base,
    currency: currencyScope.active,
    symbol,
    direction,
  };

  const [coverage, bucketRows, histogram, scatter, symbols, hourRows, durationRows] =
    await Promise.all([
      getPlanCoverage(filter),
      getTargetRBuckets(filter),
      getRHistogram(filter),
      getTargetVsRealized(filter),
      getAnalyticsSymbols({ ...base, currency: currencyScope.active }),
      getHourPerformance(filter, user.timezone),
      getDurationPerformance(filter, DURATION_BUCKETS),
    ]);

  const buckets = targetRBucketStats(bucketRows);
  const totals = targetRTotals(buckets);
  const histogramPoints = fillRDistribution(histogram, BE_BIN);
  const scatterPoints = scatter.map((p) => ({
    targetR: Number(p.targetR),
    realizedR: Number(p.realizedR),
    symbol: p.symbol,
    direction: p.direction,
    hit: p.hit,
  }));

  // Valuta di visualizzazione: quella dello scope (mai una somma cross-valuta).
  const currency =
    currencyScope.active ?? user.baseCurrency;

  const hourSegments = fillHourSegments(hourRows);
  const durationSegments = fillDurationSegments(durationRows);
  const bestHour = bestAndWorst(hourSegments, (s) => s.avgR);
  const bestDuration = bestAndWorst(durationSegments, (s) => s.avgR);

  const senzaR = coverage.total - coverage.withR;
  const senzaPiano = coverage.withR - coverage.withTargetR;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">
              Distribuzione dei ritorni per target R · {period.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currencyScope.multi && (
              <CurrencyFilter
                currencies={currencyScope.totals.map((t) => t.currency)}
                active={currencyScope.active}
              />
            )}
            <PeriodFilter
              periodKey={period.key}
              fromKey={period.fromKey}
              toKey={period.toKey}
              label={period.label}
            />
          </div>
        </div>
        <AnalyticsFilters
          symbols={symbols}
          symbol={symbol}
          direction={direction}
        />
      </div>

      {coverage.total === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nessun trade chiuso nel periodo"
          description="Cambia periodo o filtri per vedere la distribuzione dei ritorni."
        />
      ) : (
        <>
          {/* Copertura del campione: mai far credere che le distribuzioni in R
              parlino di tutti i trade quando non è così. */}
          <p className="text-xs text-muted-foreground">
            {coverage.total} trade chiusi nel periodo · {coverage.withR} con
            rischio definito ({coverage.withTargetR} anche con target
            pianificato).
            {senzaR > 0 && ` ${senzaR} senza rischio: R non calcolabile (N/D).`}
            {senzaPiano > 0 &&
              ` ${senzaPiano} con rischio ma senza piano completo: fuori dalle fasce per target R.`}
          </p>

          {/* ① Istogramma dell'R realizzato su TUTTI i trade con rischio. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Distribuzione dell&apos;R realizzato
                <MetricInfo info={returnDistributionInfo} />
              </CardTitle>
              <CardDescription>
                Fasce da 0,5R su {coverage.withR}{" "}trade con rischio definito.
                Colonna BE dedicata per l&apos;R esattamente zero.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {histogramPoints.length > 0 ? (
                <RDistributionChart points={histogramPoints} />
              ) : (
                <EmptyState
                  compact
                  icon={BarChart3}
                  title="Nessun trade con rischio definito"
                  description="Imposta lo stop pianificato o il rischio iniziale per vedere i risultati in R."
                />
              )}
            </CardContent>
          </Card>

          {/* ② Segmentazione per bucket di target R. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Ritorni per target R
                <MetricInfo info={hitRateInfo} />
              </CardTitle>
              <CardDescription>
                Puntare più lontano alza il ritorno per trade riuscito e abbassa
                l&apos;hit rate: la colonna che decide è l&apos;expectancy.
                {totals.trades > 0 && (
                  <>
                    {" "}
                    Nel periodo: {totals.trades} trade con piano,{" "}
                    {totals.hitRate !== null && formatPercent(totals.hitRate)} al
                    target,{" "}
                    {totals.expectancyR !== null &&
                      formatRMultiple(totals.expectancyR)}{" "}
                    di attesa per trade.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {totals.trades > 0 ? (
                <TargetRTable rows={buckets} />
              ) : (
                <EmptyState
                  compact
                  icon={Target}
                  title="Nessun trade con target pianificato"
                  description="Compila stop e target nel piano del trade (o mappali nell'import CSV) per vedere questa analisi."
                />
              )}
            </CardContent>
          </Card>

          {/* §2 — performance per fascia oraria (ora di APERTURA). */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Performance per fascia oraria
                <MetricInfo info={hourPerformanceInfo} />
              </CardTitle>
              <CardDescription>
                Fasce di un&apos;ora sull&apos;orario di <strong>apertura</strong>{" "}
                del trade, nel tuo fuso ({user.timezone.replace("_", " ")}).
                {bestHour.best && bestHour.worst && (
                  <>
                    {" "}
                    Migliore <strong>{bestHour.best.label}</strong> (
                    {formatRMultiple(bestHour.best.avgR!)} su{" "}
                    {bestHour.best.total} trade) · peggiore{" "}
                    <strong>{bestHour.worst.label}</strong> (
                    {formatRMultiple(bestHour.worst.avgR!)} su{" "}
                    {bestHour.worst.total}). Le fasce con meno di 5 trade non
                    entrano in questo confronto.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SegmentPerformanceChart
                points={hourSegments}
                currency={currency}
                ariaLabel="Performance per fascia oraria"
              />
              <SegmentTable
                rows={hourSegments.filter((s) => !s.empty)}
                currency={currency}
                segmentLabel="Fascia oraria"
              />
            </CardContent>
          </Card>

          {/* §3 — performance per durata del trade. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Performance per durata
                <MetricInfo info={durationPerformanceInfo} />
              </CardTitle>
              <CardDescription>
                Quanto rende il trade al variare di quanto lo tieni aperto
                (chiusura − apertura). I confini delle fasce sono tarati sulla
                distribuzione reale dei trade, non fissati a priori.
                {bestDuration.best && bestDuration.worst && (
                  <>
                    {" "}
                    Migliore <strong>{bestDuration.best.label}</strong> (
                    {formatRMultiple(bestDuration.best.avgR!)}) · peggiore{" "}
                    <strong>{bestDuration.worst.label}</strong> (
                    {formatRMultiple(bestDuration.worst.avgR!)}).
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SegmentPerformanceChart
                points={durationSegments}
                currency={currency}
                ariaLabel="Performance per durata del trade"
              />
              <SegmentTable
                rows={durationSegments}
                currency={currency}
                segmentLabel="Durata"
              />
            </CardContent>
          </Card>

          {/* ③ Scatter target vs realizzato. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Target R vs R realizzato
              </CardTitle>
              <CardDescription>
                Ogni punto è un trade. La diagonale tratteggiata è il piano
                eseguito alla lettera: sopra hai fatto meglio del target, sotto
                sei uscito prima. La linea orizzontale è il break-even.
                {scatterPoints.length >= 600 &&
                  " Mostrati i 600 trade più recenti."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scatterPoints.length > 0 ? (
                <TargetScatterChart points={scatterPoints} />
              ) : (
                <EmptyState
                  compact
                  icon={Crosshair}
                  title="Nessun trade con target pianificato"
                  description="Servono stop e target sul trade per collocare il punto sull'asse orizzontale."
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
