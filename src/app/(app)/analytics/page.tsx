import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Decimal from "decimal.js";
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
  getRollingTradeWindow,
  getProAggregates,
  getStreakRuns,
  getTopConcentration,
  type AnalyticsFilter,
} from "@/lib/queries/analytics";
import {
  avgLoss,
  avgWin,
  breakEvenWinRate,
  breakEvenWinRateInfo,
  concentration,
  concentrationInfo,
  equityFitInfo,
  equityLinearFit,
  expectedLongestRun,
  kellyFraction,
  kellyInfo,
  optimalF,
  payoffRatio,
  riskOfRuinAnalytic,
  riskOfRuinAnalyticInfo,
  streakDistribution,
  streakDistributionInfo,
  winRate as winRateOf,
  winRateMargin,
} from "@/lib/metrics";
import { StreakDistributionChart } from "@/components/analytics/streak-distribution-chart";
import { ConcentrationTable } from "@/components/analytics/concentration-table";
import {
  DAY_WINDOWS,
  DURATION_BUCKETS,
  FEW_WINDOWS_THRESHOLD,
  ROLLING_TRADE_METRICS,
  TRADE_WINDOWS,
  bestAndWorst,
  dailyReturns,
  durationPerformanceInfo,
  fillDurationSegments,
  fillHourSegments,
  hourPerformanceInfo,
  rollingRatios,
  rollingRatiosInfo,
  rollingTradeInfo,
  rollingTradePoints,
  seriesRange,
  type SeriesRange,
} from "@/lib/metrics";
import {
  DEFAULT_SIMS,
  HORIZON_PRESETS,
  horizonFromMonths,
  monteCarloLab,
  monteCarloLabInfo,
  riskOfRuinInfo,
  tradesPerDay,
} from "@/lib/metrics/monte-carlo-lab";
import {
  getRMultiples,
  getDailyPnl,
  getStartingBalance,
  getLifetimeNetPnl,
  getNetPnlBefore,
} from "@/lib/queries/stats";
import { MonteCarloControls } from "@/components/analytics/monte-carlo-controls";
import {
  RollingRatioChart,
  RollingTradeChart,
} from "@/components/analytics/rolling-charts";
import { RollingWindowControl } from "@/components/analytics/rolling-controls";
import {
  MetricRangeStrip,
  type MetricRangeRow,
} from "@/components/analytics/metric-range-strip";
import {
  MonteCarloFan,
  MonteCarloHistogram,
} from "@/components/analytics/monte-carlo-fan";
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
import {
  formatMoney,
  formatPercent,
  formatPercentSmall,
  formatRMultiple,
  pnlColorClass,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import { Activity, BarChart3, Crosshair, Target } from "lucide-react";
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
/** Riquadro di sintesi della simulazione: valore grande + contesto. */
function StatBox({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "profit" | "loss";
  info?: React.ComponentProps<typeof MetricInfo>["info"];
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="stat-label flex items-center gap-1">
        {label}
        {info ? <MetricInfo info={info} /> : null}
      </div>
      <div
        className={cn(
          "stat-value mt-1",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {sub ? <div className="stat-sub mt-0.5">{sub}</div> : null}
    </div>
  );
}

/**
 * Sceglie la finestra rolling: quella richiesta se lo storico la sostiene,
 * altrimenti la più lunga che ci sta dentro. null = nemmeno la più corta è
 * sostenibile, e allora si mostra il gate invece di un grafico con due punti.
 * I preset sono in ordine crescente.
 */
function pickWindow<T extends number>(
  presets: readonly T[],
  requested: number,
  available: number,
): T | null {
  const fitting = presets.filter((p) => p <= available);
  if (fitting.length === 0) return null;
  const asked = presets.find((p) => p === requested);
  return asked !== undefined && asked <= available
    ? asked
    : fitting[fitting.length - 1];
}

/** Riga della strip "corrente vs range storico", già formattata. */
function rangeRow(
  label: string,
  range: SeriesRange,
  format: (value: string) => string,
  /** Soglia sopra la quale il valore corrente è "buono" (0, 1…). */
  goodAbove?: string,
): MetricRangeRow {
  const show = (value: string | null) => (value === null ? "—" : format(value));
  return {
    label,
    current: show(range.current),
    min: show(range.min),
    max: show(range.max),
    median: show(range.median),
    position: range.position === null ? null : Number(range.position),
    medianPosition:
      range.medianPosition === null ? null : Number(range.medianPosition),
    tone:
      goodAbove === undefined || range.current === null
        ? undefined
        : new Decimal(range.current).gt(goodAbove)
          ? "profit"
          : "loss",
  };
}

/**
 * Avvertenza sulle serie corte. Le finestre mobili si sovrappongono: due
 * punti vicini condividono quasi tutti i dati, quindi poche finestre non
 * sono poche osservazioni indipendenti — sono quasi una sola. Il grafico
 * resta visibile (il dato non si nasconde), ma con il contesto accanto.
 */
function FewWindowsNote({ count, unit }: { count: number; unit: string }) {
  if (count >= FEW_WINDOWS_THRESHOLD) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Solo {count} {unit} piene nel periodo: i valori sono corretti ma poco
      informativi come <em>serie</em> — le finestre si sovrappongono quasi
      del tutto, quindi il range storico qui sopra è costruito su pochi dati
      indipendenti. Serve più storico prima di leggerci un andamento.
    </p>
  );
}

/** Rapporti adimensionali (Sharpe, Sortino, profit factor): due decimali. */
const formatRatio = (value: string) =>
  Number(value).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

  // §1 — Monte Carlo: gli R storici dello scope sono l'urna del bootstrap, il
  // saldo reale è il punto di partenza dell'equity simulata. La serie
  // giornaliera serve solo a stimare la frequenza di trade (orizzonte
  // temporale), non entra nella simulazione.
  const [mcR, mcDaily, mcStartBalance, mcLifetime] = await Promise.all([
    getRMultiples(filter),
    getDailyPnl(filter, user.timezone),
    getStartingBalance(filter),
    getLifetimeNetPnl(filter),
  ]);
  const startingEquity = new Decimal(mcStartBalance).plus(mcLifetime).toFixed(2);

  const perDay =
    mcDaily.length >= 2
      ? tradesPerDay(
          mcDaily.reduce((a, d) => a + d.trades, 0),
          Math.max(
            1,
            Math.round(
              (new Date(mcDaily.at(-1)!.day).getTime() -
                new Date(mcDaily[0].day).getTime()) /
                86_400_000,
            ) + 1,
          ),
        )
      : null;

  const mcMonths = typeof params.mcM === "string" ? Number(params.mcM) : null;
  const horizonFromParam =
    typeof params.mcH === "string" ? Number(params.mcH) : null;
  const mcHorizon =
    (mcMonths ? horizonFromMonths(mcMonths, perDay) : null) ??
    (horizonFromParam && HORIZON_PRESETS.includes(horizonFromParam as 100)
      ? horizonFromParam
      : 250);
  const mcRiskMode =
    params.mcMode === "fixed-amount" ? "fixed-amount" : "fixed-fractional";
  const mcRiskPct = typeof params.mcRisk === "string" ? params.mcRisk : "0.01";
  const mcMethod = params.mcMet === "parametric" ? "parametric" : "bootstrap";
  // Rischio di default in importo fisso: il rischio medio storico dell'utente.
  const mcRisk =
    mcRiskMode === "fixed-fractional"
      ? mcRiskPct
      : new Decimal(startingEquity).times("0.01").toFixed(2);

  const simulation =
    Number(startingEquity) > 0
      ? monteCarloLab(mcR, {
          horizon: mcHorizon,
          sims: DEFAULT_SIMS,
          startingEquity,
          riskPerTrade: mcRisk,
          riskMode: mcRiskMode,
          method: mcMethod,
        })
      : null;

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

  // §2 — ROLLING METRICS.
  //
  // I ritorni giornalieri sono un fatto di CONTO, non di strumento: la serie
  // riusa `mcDaily` (getDailyPnl ignora i filtri simbolo/direzione) e parte
  // dall'equity a INIZIO periodo — saldo iniziale più il P&L chiuso prima
  // del periodo selezionato. Senza quest'ultimo pezzo un periodo che inizia
  // a metà storia dividerebbe per il solo saldo iniziale, gonfiando ogni
  // ritorno di un conto cresciuto nel frattempo.
  const pnlBeforePeriod = await getNetPnlBefore(
    { userId, accountId, currency: currencyScope.active },
    period.from,
  );
  const seriesEquity = new Decimal(mcStartBalance)
    .plus(pnlBeforePeriod)
    .toFixed(2);
  const returnsSeries = new Decimal(seriesEquity).gt(0)
    ? dailyReturns(mcDaily, seriesEquity)
    : [];

  const dayWindow = pickWindow(
    DAY_WINDOWS,
    Number(params.rw),
    returnsSeries.length,
  );
  const ratioPoints = dayWindow ? rollingRatios(returnsSeries, dayWindow) : [];
  const ratioRangeRows: MetricRangeRow[] = [
    rangeRow("Sharpe", seriesRange(ratioPoints.map((p) => p.sharpe)), formatRatio, "0"),
    rangeRow("Sortino", seriesRange(ratioPoints.map((p) => p.sortino)), formatRatio, "0"),
  ];

  // La finestra a trade, invece, rispetta i filtri della pagina: lì ogni
  // punto è una statistica di trade, non di conto.
  const tradeWindow = pickWindow(
    TRADE_WINDOWS,
    Number(params.rt),
    coverage.total,
  );
  const tradePoints = rollingTradePoints(
    tradeWindow
      ? await getRollingTradeWindow(filter, user.timezone, tradeWindow)
      : [],
  );
  const unitFormat: Record<
    (typeof ROLLING_TRADE_METRICS)[number]["unit"],
    (value: string) => string
  > = {
    percent: (v) => formatPercent(v),
    r: (v) => formatRMultiple(v),
    money: (v) => formatMoney(v, currency),
    ratio: formatRatio,
  };
  const tradeRangeRows: MetricRangeRow[] = ROLLING_TRADE_METRICS.map((m) =>
    rangeRow(
      m.label,
      seriesRange(tradePoints.map((p) => p[m.key])),
      unitFormat[m.unit],
      m.reference ?? undefined,
    ),
  );

  // §3 — METRICHE PRO. Gli aggregati rispettano i filtri della pagina; R²
  // ed equity vengono dalla serie di conto (come il rolling annualizzato).
  const [proAgg, streakRuns, concentrationRow] = await Promise.all([
    getProAggregates(filter),
    getStreakRuns(filter),
    getTopConcentration(filter),
  ]);

  const proWinRate = winRateOf(proAgg.wins, proAgg.total);
  const proAvgWin = avgWin(proAgg.winSum, proAgg.wins);
  const proAvgLoss = avgLoss(proAgg.lossSum, proAgg.losses);
  const proPayoff = payoffRatio(proAvgWin, proAvgLoss);

  const beWinRate = breakEvenWinRate(proPayoff);
  const beMargin = winRateMargin(proWinRate, beWinRate);
  const kelly = kellyFraction(proWinRate, proPayoff);
  const optF = optimalF(mcR);
  const equityFit = equityLinearFit(returnsSeries.map((d) => d.equityStart));

  // Capitale in unità di perdita media: è la grandezza che governa la
  // rovina, non l'importo assoluto. Un conto da 100.000 che rischia 10.000
  // a trade è più fragile di uno da 10.000 che ne rischia 100.
  const ruinUnits =
    proAvgLoss !== null && new Decimal(proAvgLoss).gt(0)
      ? new Decimal(startingEquity).div(proAvgLoss).toFixed(4)
      : null;
  const ruinAnalytic =
    proWinRate !== null && proPayoff !== null && ruinUnits !== null
      ? riskOfRuinAnalytic({
          winRate: proWinRate,
          payoff: proPayoff,
          units: ruinUnits,
        })
      : null;

  const streaks = streakDistribution(streakRuns);
  const lossProbability =
    proAgg.total > 0
      ? new Decimal(proAgg.losses).div(proAgg.total).toFixed(4)
      : null;
  const winProbability =
    proAgg.total > 0
      ? new Decimal(proAgg.wins).div(proAgg.total).toFixed(4)
      : null;
  const expectedLossRun = lossProbability
    ? expectedLongestRun(proAgg.total, lossProbability)
    : null;
  const expectedWinRun = winProbability
    ? expectedLongestRun(proAgg.total, winProbability)
    : null;

  const profitConcentration = concentration({
    ...concentrationRow,
    netPnl: proAgg.netPnl,
  });

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
        <Suspense fallback={<div className="h-9" />}>
          <AnalyticsFilters
            symbols={symbols}
            symbol={symbol}
            direction={direction}
          />
        </Suspense>
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

          {/* §1 — simulazione Monte Carlo. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Simulazione Monte Carlo
                <MetricInfo info={monteCarloLabInfo} />
              </CardTitle>
              <CardDescription>
                {simulation
                  ? `${simulation.sims.toLocaleString("it-IT")} scenari da ${simulation.horizon} trade, ricampionando i tuoi ${simulation.sampleSize} R storici.`
                  : "Servono almeno 30 trade con rischio definito per una proiezione onesta."}
                {mcMonths && perDay && simulation
                  ? ` Orizzonte temporale convertito in ${simulation.horizon} trade con la tua frequenza storica (${perDay.toFixed(2).replace(".", ",")} trade al giorno): assume che tu continui a operare con lo stesso ritmo.`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Suspense fallback={<div className="h-20" />}>
                <MonteCarloControls
                  horizon={mcHorizon}
                  riskPct={mcRiskPct}
                  riskMode={mcRiskMode}
                  method={mcMethod}
                  monthsAvailable={perDay !== null}
                />
              </Suspense>

              {simulation ? (
                <>
                  <MonteCarloFan
                    fan={simulation.fan}
                    startingEquity={Number(startingEquity)}
                    currency={currency}
                  />

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatBox
                      label="P(in profitto)"
                      value={formatPercent(simulation.probProfit.toFixed(4))}
                      tone={simulation.probProfit >= 0.5 ? "profit" : "loss"}
                    />
                    <StatBox
                      label="Max drawdown mediano"
                      value={formatPercent(simulation.maxDrawdown.median.toFixed(4))}
                      sub={`95° percentile ${formatPercent(simulation.maxDrawdown.p95.toFixed(4))}`}
                    />
                    <StatBox
                      label="Risk of ruin"
                      value={formatPercentSmall(simulation.riskOfRuin.toFixed(4))}
                      sub="soglia: perdita del 50%"
                      tone={simulation.riskOfRuin > 0.05 ? "loss" : undefined}
                      info={riskOfRuinInfo}
                    />
                    <StatBox
                      label="Ritorno mediano"
                      value={formatPercent(simulation.finalReturn.p50.toFixed(4))}
                      tone={simulation.finalReturn.p50 >= 0 ? "profit" : "loss"}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <h3 className="stat-label mb-2">Equity finale</h3>
                      <MonteCarloHistogram
                        bars={simulation.histogram}
                        currency={currency}
                      />
                    </div>
                    <div>
                      <h3 className="stat-label mb-2">Percentili</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                              <th className="py-2 pr-3 font-medium">Scenario</th>
                              <th className="py-2 pr-3 text-right font-medium">
                                Equity finale
                              </th>
                              <th className="py-2 text-right font-medium">Ritorno</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              [
                                ["Peggiore (5%)", "p05"],
                                ["Sfavorevole (25%)", "p25"],
                                ["Mediano", "p50"],
                                ["Favorevole (75%)", "p75"],
                                ["Migliore (95%)", "p95"],
                              ] as const
                            ).map(([label, key]) => (
                              <tr key={key} className="border-b last:border-0">
                                <td className="py-2 pr-3">{label}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">
                                  {formatMoney(
                                    simulation.finalEquity[key].toFixed(2),
                                    currency,
                                  )}
                                </td>
                                <td
                                  className={cn(
                                    "py-2 text-right font-medium tabular-nums",
                                    pnlColorClass(
                                      simulation.finalReturn[key].toFixed(4),
                                    ),
                                  )}
                                >
                                  {formatPercent(
                                    simulation.finalReturn[key].toFixed(4),
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Probabilità di superare un drawdown:{" "}
                        {simulation.probDrawdownOver
                          .map(
                            (d) =>
                              `${formatPercent(String(d.threshold))} → ${formatPercent(d.probability.toFixed(4))}`,
                          )
                          .join(" · ")}
                      </p>
                    </div>
                  </div>

                  {/* Caveat obbligatorio, in pagina e non nascosto in un tooltip. */}
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <strong className="text-foreground">
                      Questa non è una previsione.
                    </strong>{" "}
                    La simulazione assume trade indipendenti e una distribuzione
                    dei risultati stabile nel tempo: la realtà raggruppa le
                    perdite, cambia regime, e cambia anche il tuo comportamento
                    dopo un drawdown. Serve a farsi un&apos;idea della{" "}
                    <em>variabilità</em> — quanto può andare male una serie
                    normale — non del risultato che otterrai. Non è un consiglio
                    finanziario.
                    {simulation.method === "parametric"
                      ? " Il metodo parametrico usa solo win rate e R medio: perde code e asimmetria della tua distribuzione reale, ed è qui soltanto come confronto."
                      : ""}
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={BarChart3}
                  title="Storico troppo corto per simulare"
                  description="Servono almeno 30 trade chiusi con rischio definito: sotto quella soglia la proiezione direbbe più del dato che la sostiene."
                />
              )}
            </CardContent>
          </Card>

          {/* §2 — rolling Sharpe/Sortino sui RITORNI giornalieri. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Sharpe e Sortino rolling
                <MetricInfo info={rollingRatiosInfo} />
              </CardTitle>
              <CardDescription>
                {dayWindow
                  ? `Finestra mobile di ${dayWindow} sedute, annualizzata ×√252 (${ratioPoints.length} finestre piene).`
                  : "Servono almeno 60 sedute nel periodo selezionato."}{" "}
                Ritorno di una giornata = P&amp;L del giorno ÷ equity a inizio
                giornata; le sedute senza trade entrano a ritorno 0 e il
                risk-free è 0. Il calcolo è sull&apos;intero conto: i filtri
                strumento e direzione non si applicano qui, perché
                l&apos;equity non è di un singolo strumento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Suspense fallback={<div className="h-9" />}>
                <RollingWindowControl
                  param="rw"
                  value={dayWindow ?? DAY_WINDOWS[0]}
                  options={DAY_WINDOWS}
                  label="Finestra"
                  suffix="sedute"
                  maxAvailable={returnsSeries.length}
                />
              </Suspense>

              {ratioPoints.length > 0 ? (
                <>
                  <RollingRatioChart points={ratioPoints} />
                  <MetricRangeStrip rows={ratioRangeRows} />
                  <FewWindowsNote count={ratioPoints.length} unit="finestre" />
                  {/* Differenza dichiarata, non lasciata scoprire. */}
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Questi due valori{" "}
                    <strong className="text-foreground">
                      non coincidono con lo Sharpe e il Sortino della
                      dashboard
                    </strong>
                    : quelli sono calcolati sui P&amp;L giornalieri in valuta e
                    non sono annualizzati, quindi cambiano se cambia la
                    dimensione del conto. Qui si parte dai ritorni, che sono
                    confrontabili fra conti di taglia diversa e con qualunque
                    altra strategia.
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={Activity}
                  title="Storico troppo corto per una finestra mobile"
                  description="Servono almeno 60 sedute (giorni feriali dal primo all'ultimo trade del periodo) perché una sola finestra sia piena."
                />
              )}
            </CardContent>
          </Card>

          {/* §2 — metriche journal su finestra a NUMERO DI TRADE. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Metriche rolling per finestra di trade
                <MetricInfo info={rollingTradeInfo} />
              </CardTitle>
              <CardDescription>
                {tradeWindow
                  ? `Ogni punto riassume i ${tradeWindow} trade fino a quello (${tradePoints.length} punti mostrati).`
                  : "Servono almeno 50 trade chiusi nel periodo selezionato."}{" "}
                La finestra è a numero di trade, non a giorni: una pausa
                dall&apos;operatività non diluisce il dato. Una metrica alla
                volta, perché win rate, R, valuta e profit factor non stanno
                sulla stessa scala.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Suspense fallback={<div className="h-9" />}>
                <RollingWindowControl
                  param="rt"
                  value={tradeWindow ?? TRADE_WINDOWS[0]}
                  options={TRADE_WINDOWS}
                  label="Finestra"
                  suffix="trade"
                  maxAvailable={coverage.total}
                />
              </Suspense>

              {tradePoints.length > 0 ? (
                <>
                  <RollingTradeChart points={tradePoints} currency={currency} />
                  <MetricRangeStrip rows={tradeRangeRows} />
                  <FewWindowsNote count={tradePoints.length} unit="finestre" />
                </>
              ) : (
                <EmptyState
                  compact
                  icon={Activity}
                  title="Storico troppo corto per una finestra mobile"
                  description="Servono almeno 50 trade chiusi: sotto quella soglia la serie mostrerebbe soltanto l'assestamento iniziale."
                />
              )}
            </CardContent>
          </Card>

          {/* §3 — metriche pro: quattro numeri che rispondono a domande
              diverse da quelle della dashboard. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metriche pro</CardTitle>
              <CardDescription>
                Le metriche di base (Sortino, Calmar, profit factor, payoff,
                streak) restano in dashboard: qui ci sono quelle che servono a
                decidere, non a fotografare.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatBox
                  label="Break-even win rate"
                  value={beWinRate === null ? "—" : formatPercent(beWinRate)}
                  sub={
                    proWinRate !== null && beMargin !== null
                      ? `il tuo è ${formatPercent(proWinRate)} · margine ${
                          new Decimal(beMargin).gte(0) ? "+" : ""
                        }${formatPercent(beMargin)}`
                      : "payoff non calcolabile"
                  }
                  tone={
                    beMargin === null
                      ? undefined
                      : new Decimal(beMargin).gt(0)
                        ? "profit"
                        : "loss"
                  }
                  info={breakEvenWinRateInfo}
                />
                <StatBox
                  label="Regolarità equity (R²)"
                  value={
                    equityFit.r2 === null ? "—" : formatPercent(equityFit.r2)
                  }
                  sub={
                    equityFit.slope === null
                      ? "serie troppo corta"
                      : `pendenza ${formatMoney(equityFit.slope, currency)} a seduta · ${equityFit.points} sedute`
                  }
                  tone={
                    equityFit.slope === null
                      ? undefined
                      : new Decimal(equityFit.slope).gte(0)
                        ? "profit"
                        : "loss"
                  }
                  info={equityFitInfo}
                />
                <StatBox
                  label="Kelly"
                  value={kelly === null ? "—" : formatPercent(kelly)}
                  sub={
                    optF
                      ? `optimal f ${formatPercent(optF.f)} su ${optF.sampleSize} R · usane una frazione`
                      : "optimal f: servono 30 trade con rischio"
                  }
                  info={kellyInfo}
                />
                <StatBox
                  label="Risk of ruin (analitico)"
                  value={formatPercentSmall(ruinAnalytic)}
                  sub={
                    simulation
                      ? `Monte Carlo (perdita del 50%): ${formatPercentSmall(simulation.riskOfRuin.toFixed(4))}`
                      : "formula chiusa, azzeramento del conto"
                  }
                  tone={
                    ruinAnalytic !== null &&
                    new Decimal(ruinAnalytic).gt("0.05")
                      ? "loss"
                      : undefined
                  }
                  info={riskOfRuinAnalyticInfo}
                />
              </div>

              {/* Le due misure di rovina non sono confrontabili alla lettera:
                  vanno lette per quello che ciascuna assume. */}
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">
                  Le due misure di rovina rispondono a domande diverse.
                </strong>{" "}
                Quella analitica assume rischio fisso per trade e orizzonte
                infinito, e misura l&apos;azzeramento del conto; quella del
                Monte Carlo ricampiona i tuoi R su un orizzonte finito e usa
                come soglia la perdita del 50%. Se divergono, la differenza
                sta nelle ipotesi — ed è un&apos;informazione. Kelly e optimal
                f non sono size consigliate: sono il limite oltre il quale
                nessuna teoria ti dà ragione.
              </p>

              <p className="text-xs text-muted-foreground">
                Cerchi la performance per giorno della settimana? Sta in{" "}
                <Link href="/reports" className="underline underline-offset-2">
                  Reports
                </Link>{" "}
                e non è duplicata qui: stesse colonne, un posto solo.
              </p>
            </CardContent>
          </Card>

          {/* §3 — distribuzione delle lunghezze di streak. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Distribuzione delle streak
                <MetricInfo info={streakDistributionInfo} />
              </CardTitle>
              <CardDescription>
                Quante volte è capitata una serie di 2, 3, 5 trade consecutivi
                dello stesso segno. I breakeven spezzano le serie.
                {streaks.longestLoss > 0 && expectedLossRun !== null && (
                  <>
                    {" "}
                    La tua serie di perdite più lunga è di{" "}
                    <strong>{streaks.longestLoss}</strong> trade, contro le{" "}
                    <strong>
                      {expectedLossRun.replace(".", ",")}
                    </strong>{" "}
                    che il puro caso produrrebbe su {proAgg.total} trade con
                    il tuo win rate
                    {new Decimal(streaks.longestLoss).lte(
                      new Decimal(expectedLossRun).plus(1),
                    )
                      ? ": dentro la norma, non è successo niente al tuo sistema."
                      : ": più lunga dell'attesa, ma il confronto assume trade indipendenti."}
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {streaks.bars.length > 0 ? (
                <>
                  <StreakDistributionChart bars={streaks.bars} />
                  <p className="text-xs text-muted-foreground">
                    {streaks.winRuns} serie di vincite (la più lunga{" "}
                    {streaks.longestWin}
                    {expectedWinRun !== null &&
                      `, attesa ${expectedWinRun.replace(".", ",")}`}
                    ) · {streaks.lossRuns} serie di perdite (la più lunga{" "}
                    {streaks.longestLoss}).
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={Activity}
                  title="Nessuna serie da mostrare"
                  description="Servono trade chiusi con esito diverso da breakeven."
                />
              )}
            </CardContent>
          </Card>

          {/* §3 — concentrazione del profitto. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Concentrazione del profitto
                <MetricInfo info={concentrationInfo} />
              </CardTitle>
              <CardDescription>
                Quanta parte del profitto lordo (
                {formatMoney(profitConcentration.grossProfit, currency)} su{" "}
                {profitConcentration.winners} trade vincenti) viene dai
                migliori, e cosa resterebbe togliendoli.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profitConcentration.slices.length > 0 ? (
                <ConcentrationTable
                  data={profitConcentration}
                  currency={currency}
                />
              ) : (
                <EmptyState
                  compact
                  icon={Target}
                  title="Nessun trade vincente nel periodo"
                  description="La concentrazione si misura sul profitto lordo: senza vincenti non c'è nulla da ripartire."
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
