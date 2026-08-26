import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Decimal from "decimal.js";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { resolvePeriod } from "@/lib/period";
import { periodCookieFallback } from "@/lib/period-cookie";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { getCurrencyBreakdown } from "@/lib/queries/stats";
import {
  getAnalyticsSymbols,
  getPlanCoverage,
  getRHistogram,
  getTargetRBuckets,
  getTargetVsRealized,
  getHourPerformance,
  HOUR_BASES,
  type HourBasis,
  getDurationPerformance,
  getDurationOutcomes,
  getRollingTradeWindow,
  getProAggregates,
  getStrategyDayPnl,
  getSymbolTrading,
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
  benchmarkRows,
  benchmarkCoverage,
  benchmarkInfo,
  correlationMatrix,
  correlationInfo,
  CORRELATION_MIN_DAYS,
  equityFitInfo,
  equityLinearFit,
  expectedLongestRun,
  kellyFraction,
  kellyInfo,
  optimalF,
  payoffRatio,
  riskOfRuinAnalytic,
  riskOfRuinAnalyticInfo,
  valueAtRisk,
  valueAtRiskInfo,
  VAR_MIN_OBSERVATIONS,
  streakDistribution,
  streakDistributionInfo,
  winRate as winRateOf,
  winRateMargin,
} from "@/lib/metrics";
import { ConcentrationTable } from "@/components/analytics/concentration-table";
import { CorrelationMatrixTable } from "@/components/analytics/correlation-matrix";
import { BenchmarkTable } from "@/components/analytics/benchmark-table";
import {
  getInstrumentCloses,
  instrumentForSymbol,
} from "@/lib/queries/benchmark";
import {
  DAY_WINDOWS,
  DURATION_BUCKETS,
  FEW_WINDOWS_THRESHOLD,
  ROLLING_TRADE_METRICS,
  TRADE_WINDOWS,
  bestAndWorst,
  dailyReturns,
  durationPerformanceInfo,
  holdingTimeOutcome,
  holdingTimeInfo,
  HOLDING_MIN_TRADES,
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
import { equitySimulatorInfo } from "@/lib/metrics/equity-simulator";
import {
  getRMultiples,
  getDailyPnl,
  getStartingBalance,
  getLifetimeNetPnl,
  getNetPnlBefore,
  getTradeAggregates,
} from "@/lib/queries/stats";
// T-1 — i grafici di /analytics passano dai wrapper lazy come quelli di
// /dashboard e /trades: nessuno sta sopra la piega, e recharts+d3 usciva dal
// percorso critico solo per le altre due route.
import {
  EquitySimulator,
  RDistributionChart,
  RollingRatioChart,
  RollingTradeChart,
  SegmentPerformanceChart,
  StreakDistributionChart,
  TargetScatterChart,
} from "@/components/charts/lazy-charts";
import { RollingWindowControl } from "@/components/analytics/rolling-controls";
import {
  MetricRangeStrip,
  type MetricRangeRow,
} from "@/components/analytics/metric-range-strip";
import { SegmentTable } from "@/components/analytics/segment-table";
import { HourBasisToggle } from "@/components/analytics/hour-basis-toggle";
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
  formatSignedMoney,
} from "@/lib/money";
import { formatDurationSec } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import { Activity, BarChart3, Crosshair, Target } from "lucide-react";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { TargetRTable } from "@/components/analytics/target-r-table";
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
  accountScoped = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "profit" | "loss";
  info?: React.ComponentProps<typeof MetricInfo>["info"];
  /**
   * true = metrica di CONTO con un filtro strumento/direzione ATTIVO: va
   * detto sulla card, altrimenti il numero che non si muove sembra un bug e
   * non una scelta. Lo decide il chiamante, che conosce i filtri.
   */
  accountScoped?: boolean;
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
      {accountScoped ? <AccountScopeNote className="mt-1.5" /> : null}
    </div>
  );
}

/**
 * Avviso "metrica di conto". Il flag viaggia come prop e MAI come stato di
 * modulo: la pagina è un server component e più richieste convivono nello
 * stesso processo — una variabile condivisa mostrerebbe l'avviso di un utente
 * nella pagina di un altro.
 */
function AccountScopeNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded border border-dashed px-1.5 py-1 text-2xs text-muted-foreground",
        className,
      )}
    >
      Metrica di conto: non filtrata per simbolo/direzione.
    </p>
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

  // B3-4 — periodo ricordato dal cookie quando l'URL non ne porta uno esplicito.
  const period = resolvePeriod(params, user.timezone, undefined, await periodCookieFallback());
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

  // Base della performance oraria: apertura (default) o chiusura. Parsing
  // LENIENT come ogni altro filtro: un valore non riconosciuto torna al
  // default invece di rompere la pagina.
  const hourBasis: HourBasis = (HOUR_BASES as readonly string[]).includes(
    typeof params.hb === "string" ? params.hb : "",
  )
    ? (params.hb as HourBasis)
    : "open";

  // Le metriche di CONTO (rolling, R², Kelly, risk of ruin, simulatore)
  // leggono l'equity intera e non possono rispettare un filtro strumento o
  // direzione. Con un filtro attivo lo dichiarano sulla card.
  const instrumentFilterActive = symbol !== undefined || direction !== undefined;

  const filter: AnalyticsFilter = {
    ...base,
    currency: currencyScope.active,
    symbol,
    direction,
  };

  // Q-13 — Kelly, optimal f, risk of ruin e gli aggregati R dei default del
  // simulatore (Q-12) sono metriche di CONTO (frazioni dell'equity intera):
  // ignorano simbolo/direzione, come le rolling annualizzate.
  const accountFilter: AnalyticsFilter = {
    ...base,
    currency: currencyScope.active,
  };

  // P-04 — UN solo stadio di query dopo la risoluzione valuta: i vecchi
  // stadi ③④⑤⑦ (coverage+distribuzioni, dati simulatore, P&L pre-periodo,
  // aggregati pro) erano `await` in sequenza senza dipendenze reali tra
  // loro — ogni stadio pagava un round-trip pieno verso il DB. Le query
  // sono INVARIATE: cambia solo quando partono. L'unica dipendenza vera è
  // la rolling window a trade, che sceglie il preset con `coverage.total`:
  // si aggancia alla promise della coverage (la COUNT "anticipata") e parte
  // appena quella risolve, in overlap con tutte le altre.
  const coveragePromise = getPlanCoverage(filter);
  const rollingRowsPromise = coveragePromise.then((cov) => {
    const window = pickWindow(TRADE_WINDOWS, Number(params.rt), cov.total);
    return window ? getRollingTradeWindow(filter, user.timezone, window) : [];
  });
  const [
    coverage,
    bucketRows,
    histogram,
    scatter,
    symbols,
    hourRows,
    durationRows,
    durationOutcomeRows,
    // §1 — Equity curve simulator (Fase 34): il saldo reale del conto è il
    // default di Start Equity. Gli R storici servono all'optimal f (§3), la
    // serie giornaliera alle metriche rolling (§2): le query restano condivise.
    mcR,
    mcDaily,
    mcStartBalance,
    mcLifetime,
    pnlBeforePeriod,
    // §3 — metriche pro: aggregati coi filtri di pagina e di conto.
    proAgg,
    accountAgg,
    rAgg,
    streakRuns,
    strategyDays,
    symbolTrading,
    concentrationRow,
    rollingRows,
  ] = await Promise.all([
    coveragePromise,
    getTargetRBuckets(filter),
    getRHistogram(filter),
    getTargetVsRealized(filter),
    getAnalyticsSymbols({ ...base, currency: currencyScope.active }),
    getHourPerformance(filter, user.timezone, hourBasis),
    getDurationPerformance(filter, DURATION_BUCKETS),
    getDurationOutcomes(filter),
    getRMultiples(filter),
    getDailyPnl(filter, user.timezone),
    getStartingBalance(filter),
    getLifetimeNetPnl(filter),
    // Equity a INIZIO periodo per i ritorni rolling (vedi §2 sotto).
    getNetPnlBefore({ userId, accountId, currency: currencyScope.active }, period.from),
    getProAggregates(filter),
    getProAggregates(accountFilter),
    getTradeAggregates(accountFilter),
    getStreakRuns(filter),
    getStrategyDayPnl(filter, user.timezone),
    getSymbolTrading(filter, user.timezone),
    getTopConcentration(filter),
    rollingRowsPromise,
  ]);
  const startingEquity = new Decimal(mcStartBalance).plus(mcLifetime).toFixed(2);

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
  // P-04 — stesso `pickWindow` (puro) usato per far partire la query nello
  // stadio unico: qui serve solo per l'interfaccia dei controlli.
  const tradeWindow = pickWindow(
    TRADE_WINDOWS,
    Number(params.rt),
    coverage.total,
  );
  const tradePoints = rollingTradePoints(rollingRows);
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
  // Le query stanno nello stadio unico qui sopra (P-04).
  const proWinRate = winRateOf(proAgg.wins, proAgg.total);
  const proAvgWin = avgWin(proAgg.winSum, proAgg.wins);
  const proAvgLoss = avgLoss(proAgg.lossSum, proAgg.losses);
  const proPayoff = payoffRatio(proAvgWin, proAvgLoss);

  // Q-09 — soglia coerente con la convenzione BE-nel-denominatore: la quota
  // di breakeven abbassa i vincenti necessari, e il margine mostrato è la
  // distanza VERA dal pareggio.
  const beShare =
    proAgg.total > 0
      ? new Decimal(proAgg.breakevens).div(proAgg.total).toFixed(4)
      : null;
  const beWinRate = breakEvenWinRate(proPayoff, beShare);
  const beMargin = winRateMargin(proWinRate, beWinRate);

  // Q-09/Minori — Kelly e RoR nel modello binario: i breakeven (che perdono
  // 0, non −1) restano FUORI dal lancio della moneta: p = W/(W+L) sui soli
  // trade direzionali, non il win rate BE-diluito con q = 1−p.
  const accDirectional = accountAgg.wins + accountAgg.losses;
  const accWinRate =
    accDirectional > 0
      ? new Decimal(accountAgg.wins).div(accDirectional).toFixed(4)
      : null;
  const accAvgWin = avgWin(accountAgg.winSum, accountAgg.wins);
  const accAvgLoss = avgLoss(accountAgg.lossSum, accountAgg.losses);
  const accPayoff = payoffRatio(accAvgWin, accAvgLoss);

  // VaR/CVaR storici sulla stessa serie giornaliera di rolling e Sortino:
  // sono metriche di CONTO, non di strumento — la serie non conosce i filtri
  // simbolo/direzione, e dirlo sulla card è la stessa regola delle rolling.
  const risk = valueAtRisk(returnsSeries);

  const kelly = kellyFraction(accWinRate, accPayoff);
  const optF = optimalF(mcR);
  const equityFit = equityLinearFit(returnsSeries.map((d) => d.equityStart));

  // Capitale in unità di perdita media: è la grandezza che governa la
  // rovina, non l'importo assoluto. Un conto da 100.000 che rischia 10.000
  // a trade è più fragile di uno da 10.000 che ne rischia 100.
  const ruinUnits =
    accAvgLoss !== null && new Decimal(accAvgLoss).gt(0)
      ? new Decimal(startingEquity).div(accAvgLoss).toFixed(4)
      : null;
  const ruinAnalytic =
    accWinRate !== null && accPayoff !== null && ruinUnits !== null
      ? riskOfRuinAnalytic({
          winRate: accWinRate,
          payoff: accPayoff,
          units: ruinUnits,
        })
      : null;

  // Q-12 — default del simulatore dal modello binario COERENTE col motore
  // (ogni non-vincita perde l'intero rischio): p e ratio dai soli trade
  // direzionali CON rischio definito, in R — i breakeven non sono simulati.
  const simDirectional = rAgg.rWins + rAgg.rLosses;
  const simWinProbability =
    simDirectional > 0
      ? new Decimal(rAgg.rWins).div(simDirectional).toFixed(4)
      : null;
  const simAvgWinR =
    rAgg.rWins > 0 ? new Decimal(rAgg.rWinSum).div(rAgg.rWins) : null;
  const simAvgLossR =
    rAgg.rLosses > 0
      ? new Decimal(rAgg.rLossSum).abs().div(rAgg.rLosses)
      : null;
  const simRatio =
    simAvgWinR !== null && simAvgLossR !== null && simAvgLossR.gt(0)
      ? simAvgWinR.div(simAvgLossR).toFixed(4)
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

  /* Matrice di correlazione fra strategie: le righe SQL diventano una serie
     per strategia con il suo calendario. Le strategie con meno di 10 trade
     restano fuori — una correlazione costruita su una manciata di giornate
     descrive quelle giornate, non la strategia. */
  const strategySeries = (() => {
    const byStrategy = new Map<
      string,
      { key: string; label: string; byDay: Map<string, string>; trades: number }
    >();
    for (const row of strategyDays) {
      const entry = byStrategy.get(row.strategyId) ?? {
        key: row.strategyId,
        label: row.strategyName,
        byDay: new Map<string, string>(),
        trades: 0,
      };
      entry.byDay.set(row.day, row.netPnl);
      entry.trades += row.trades;
      byStrategy.set(row.strategyId, entry);
    }
    return [...byStrategy.values()]
      .filter((s) => s.trades >= 10)
      .sort((a, b) => b.trades - a.trades);
  })();
  const correlations = correlationMatrix(strategySeries);

  /* Confronto col buy & hold. Secondo stadio per forza: la finestra di
     chiusure da leggere dipende dai giorni in cui l'utente ha davvero
     operato, che si sanno solo dopo la query dei simboli. Una sola query in
     più, sui soli strumenti che servono. */
  const benchmarkWindow = {
    from: symbolTrading.reduce<string | null>(
      (min, r) => (min === null || r.firstDay < min ? r.firstDay : min),
      null,
    ),
    to: symbolTrading.reduce<string | null>(
      (max, r) => (max === null || r.lastDay > max ? r.lastDay : max),
      null,
    ),
  };
  const wantedInstruments = [
    ...new Set(
      symbolTrading
        .map((r) => instrumentForSymbol(r.symbol))
        .filter((i): i is string => i !== null),
    ),
  ];
  const closes =
    benchmarkWindow.from && benchmarkWindow.to && wantedInstruments.length > 0
      ? await getInstrumentCloses(
          wantedInstruments,
          benchmarkWindow.from,
          benchmarkWindow.to,
        )
      : [];
  const benchmark = benchmarkRows(
    symbolTrading,
    new Map(closes.map((c) => [c.instrument, c])),
    instrumentForSymbol,
  );
  const benchmarkCovered = benchmarkCoverage(benchmark);

  // Durata contro esito su TUTTI i trade insieme: la tabella per fascia dice
  // quanto rende ogni bucket, questa riga dice se fra i bucket ci sia un
  // andamento o solo rumore.
  const holding = holdingTimeOutcome(durationOutcomeRows);

  const hourSegments = fillHourSegments(hourRows);
  /* Il link conserva TUTTI gli altri parametri: cambiare base oraria non
     deve resettare periodo, valuta, simbolo o finestra rolling. */
  const hourBasisHref = (next: HourBasis) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "hb") query.set(key, value);
    }
    if (next !== "open") query.set("hb", next);
    const qs = query.toString();
    return `/analytics${qs ? `?${qs}` : ""}#timing`;
  };
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
            {/* D-03 — il vecchio sottotitolo descriveva solo le prime due card. */}
            <p className="page-subtitle">
              Distribuzioni, rolling, rischio e concentrazione · {period.label}
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
        {/* D-03 — ancore di navigazione interna: la pagina è ~10 card
            full-width, senza mappa chi cerca "risk of ruin" scorre tutto.
            Stesso pattern delle pillole di Trends, zero redesign. */}
        {coverage.total > 0 ? (
          <nav
            aria-label="Sezioni della pagina"
            className="flex flex-wrap gap-1.5"
          >
            {(
              [
                ["Distribuzioni", "#distribuzioni"],
                ["Simulatore", "#simulatore"],
                ["Rolling", "#rolling"],
                ["Rischio", "#rischio"],
                ["Timing", "#timing"],
              ] as const
            ).map(([label, anchor]) => (
              <a
                key={anchor}
                href={anchor}
                className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
        ) : null}
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
            {senzaR > 0 && (
              <>
                {" "}
                <Link
                  href="/trades?risk=missing"
                  className="underline underline-offset-2"
                >
                  {senzaR} senza rischio
                </Link>
                : R non calcolabile (N/D)
                {/* Il conteggio da solo non basta: se fra i trade esclusi c'è
                    quello più grosso dell'anno, la distribuzione descrive una
                    minoranza del risultato. Si dichiara anche il DENARO che
                    resta fuori. */}
                {coverage.pnlShareWithR !== null && (
                  <>
                    , e con loro{" "}
                    {formatSignedMoney(coverage.netPnlWithoutR, currency)} di
                    P&amp;L: l&apos;istogramma rappresenta il{" "}
                    {formatPercent(coverage.pnlShareWithR)} del movimento del
                    periodo
                  </>
                )}
                .
              </>
            )}
            {senzaPiano > 0 &&
              ` ${senzaPiano} con rischio ma senza piano completo: fuori dalle fasce per target R.`}
          </p>

          {/* ① Istogramma dell'R realizzato su TUTTI i trade con rischio. */}
          {/* D-03 — id ancora + scroll-mt per l'header sticky (h-14). */}
          <Card id="distribuzioni" className="scroll-mt-20">
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

          {/* §1 — equity curve simulator (Fase 34, sostituisce il Monte
              Carlo a bande percentili). */}
          <Card id="simulatore" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Equity curve simulator
                <MetricInfo info={equitySimulatorInfo} />
                {instrumentFilterActive ? (
                  <AccountScopeNote className="ml-2 inline-block" />
                ) : null}
              </CardTitle>
              <CardDescription>
                Ogni linea colorata è un percorso possibile con i parametri del
                form; la linea in grassetto è la media. I campi partono dalle
                statistiche reali del conto nel periodo, ma sono tuoi: cambiali
                per vedere come si muove il ventaglio.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <EquitySimulator
                defaultStartEquity={
                  new Decimal(startingEquity).gt(0)
                    ? new Decimal(startingEquity).toFixed(0)
                    : "10000"
                }
                defaultWinProbability={
                  simWinProbability !== null
                    ? new Decimal(simWinProbability).times(100).toFixed(1)
                    : "50"
                }
                defaultWinLossRatio={
                  simRatio !== null
                    ? new Decimal(simRatio).toFixed(2)
                    : "1.5"
                }
                currency={currency}
              />

              {/* Explanation: metodologia dichiarata, in pagina. */}
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Come funziona.</strong>{" "}
                Per ogni trade simulato si estrae un numero casuale: se cade
                sotto la probabilità di vincita il trade vale +rapporto R,
                altrimenti −1 R, e l&apos;equity si aggiorna rischiando la
                quota indicata dell&apos;equity corrente (compounding) o
                l&apos;importo fisso scelto. Nessun dato storico viene
                ricampionato: contano solo i tre parametri del form. Serve a
                vedere la <em>variabilità</em> di un edge — quanto possono
                divergere futuri con le stesse statistiche — non a prevedere
                il tuo risultato. I breakeven non sono simulati: i default di
                probabilità e rapporto win/loss
                partono dai soli trade vincenti/perdenti con rischio definito
                (p = R vincenti / (R vincenti + R perdenti), ratio = R medio
                vincente / R medio perdente), perché nel modello ogni
                non-vincita perde l&apos;intero rischio. Non è un consiglio
                finanziario.
              </p>
            </CardContent>
          </Card>

          {/* §2 — rolling Sharpe/Sortino sui RITORNI giornalieri. */}
          <Card id="rolling" className="scroll-mt-20">
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
                risk-free è 0. Il calcolo è sull&apos;intero conto, perché
                l&apos;equity non è di un singolo strumento.
                {instrumentFilterActive ? (
                  <AccountScopeNote className="mt-2" />
                ) : null}
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
          <Card id="rischio" className="scroll-mt-20">
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
                  accountScoped={instrumentFilterActive}
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
                  accountScoped={instrumentFilterActive}
                />
                <StatBox
                  label="VaR giornaliero (95%)"
                  value={risk === null ? "—" : formatMoney(risk.var, currency)}
                  sub={
                    risk === null
                      ? `servono ${VAR_MIN_OBSERVATIONS} sedute (${returnsSeries.length} nel periodo)`
                      : risk.varPct !== null
                        ? `${formatPercent(risk.varPct)} dell'equity · 1 seduta su 20`
                        : "1 seduta su 20"
                  }
                  tone={risk !== null && Number(risk.var) > 0 ? "loss" : undefined}
                  info={valueAtRiskInfo}
                  accountScoped={instrumentFilterActive}
                />
                <StatBox
                  label="CVaR giornaliero (95%)"
                  value={risk === null ? "—" : formatMoney(risk.cvar, currency)}
                  sub={
                    risk === null
                      ? `servono ${VAR_MIN_OBSERVATIONS} sedute (${returnsSeries.length} nel periodo)`
                      : `media delle ${risk.tailDays} sedute peggiori su ${risk.observations}`
                  }
                  tone={risk !== null && Number(risk.cvar) > 0 ? "loss" : undefined}
                  info={valueAtRiskInfo}
                  accountScoped={instrumentFilterActive}
                />
                <StatBox
                  label="Risk of ruin (analitico)"
                  value={formatPercentSmall(ruinAnalytic)}
                  sub="formula chiusa, azzeramento del conto intero"
                  tone={
                    ruinAnalytic !== null &&
                    new Decimal(ruinAnalytic).gt("0.05")
                      ? "loss"
                      : undefined
                  }
                  info={riskOfRuinAnalyticInfo}
                  accountScoped={instrumentFilterActive}
                />
              </div>

              {/* Ipotesi della formula dichiarate accanto al numero. */}
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">
                  Il risk of ruin analitico va letto con le sue ipotesi.
                </strong>{" "}
                Assume rischio fisso per trade, trade indipendenti e orizzonte
                infinito, e misura l&apos;azzeramento del conto: è un limite
                teorico, non una probabilità osservata. Kelly e optimal f non
                sono size consigliate: sono il limite oltre il quale nessuna
                teoria ti dà ragione. Kelly e risk of ruin sono metriche di
                CONTO: ignorano i filtri simbolo/direzione (come le rolling
                annualizzate) e i breakeven non entrano nel lancio della
                moneta (p = vincite / (vincite + perdite)).
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

          {/* Il confronto che nessuna metrica interna fa: vs stare fermo. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Il tuo trading vs stare fermo
                <MetricInfo info={benchmarkInfo} />
              </CardTitle>
              <CardDescription>
                Per ogni simbolo: quanto hai realizzato, e quanto avrebbe reso
                comprare la tua size media all&apos;inizio del periodo e non
                toccarla più.
                {benchmarkCovered.share !== null && (
                  <>
                    {" "}
                    Confronto disponibile su{" "}
                    <strong>
                      {benchmarkCovered.covered} trade su{" "}
                      {benchmarkCovered.total}
                    </strong>{" "}
                    ({formatPercent(benchmarkCovered.share)}): per gli altri
                    simboli l&apos;istanza non ha una serie di chiusure, e non
                    viene inventato un valore di ripiego.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {benchmark.length > 0 ? (
                <>
                  <BenchmarkTable rows={benchmark} currency={currency} />
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <strong className="text-foreground">Come leggerlo.</strong>{" "}
                    La serie di riferimento è il sottostante (oro spot, indice,
                    future continuo), non il contratto esatto che hai tradato:
                    su orizzonti lunghi il rollover fa divergere le due curve.
                    Il buy &amp; hold è calcolato sulla tua size MEDIA tenuta
                    per tutto il periodo — è un&apos;ipotesi di confronto, non
                    una cosa che è successa. La variazione percentuale è sempre
                    confrontabile; l&apos;importo in valuta solo se la valuta
                    del conto coincide con quella dello strumento.
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={Activity}
                  title="Nessun trade chiuso nel periodo"
                  description="Il confronto si costruisce sui simboli che hai davvero tradato."
                />
              )}
            </CardContent>
          </Card>

          {/* Correlazione fra strategie: le strategie guardate INSIEME. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Correlazione fra strategie
                <MetricInfo info={correlationInfo} />
              </CardTitle>
              <CardDescription>
                Quanto si muovono insieme i P&amp;L giornalieri. Rosso = le due
                vanno bene e male negli stessi giorni, quindi sommarle non
                riduce il rischio; verde = si alternano, ed è lì che la
                diversificazione fa il suo lavoro.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {correlations.keys.length >= 2 ? (
                <>
                  <CorrelationMatrixTable matrix={correlations} />
                  <p className="text-xs text-muted-foreground">
                    {strategySeries.length} strategie con almeno 10 trade nel
                    periodo. Nei giorni in cui una strategia non opera il suo
                    contributo è zero: è un fatto, non un dato mancante. Sotto{" "}
                    {CORRELATION_MIN_DAYS} giornate comuni la cella resta
                    vuota.
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={Crosshair}
                  title="Servono almeno due strategie"
                  description="La correlazione confronta strategie fra loro: assegna una strategia ai trade (almeno 10 per strategia) e questa matrice si popola."
                />
              )}
            </CardContent>
          </Card>

          {/* §2 — performance per fascia oraria: apertura O chiusura. */}
          <Card id="timing" className="scroll-mt-20">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  Performance per fascia oraria
                  <MetricInfo info={hourPerformanceInfo} />
                </CardTitle>
                <HourBasisToggle basis={hourBasis} hrefFor={hourBasisHref} />
              </div>
              <CardDescription>
                Fasce di un&apos;ora sull&apos;orario di{" "}
                <strong>
                  {hourBasis === "close" ? "chiusura" : "apertura"}
                </strong>{" "}
                del trade, nel tuo fuso ({user.timezone.replace("_", " ")}).{" "}
                {hourBasis === "close"
                  ? "Quando esci bene: è una domanda sulla gestione."
                  : "Quando entri bene: è una domanda sul setup."}
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
                ariaLabel={`Performance per fascia oraria di ${
                  hourBasis === "close" ? "chiusura" : "apertura"
                }`}
              />
              <SegmentTable
                rows={hourSegments.filter((s) => !s.empty)}
                currency={currency}
                segmentLabel={`Ora di ${
                  hourBasis === "close" ? "chiusura" : "apertura"
                }`}
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

              {/* La lettura d'insieme, che nessuna riga della tabella può
                  dare: con sette fasce e poche decine di trade per fascia il
                  rumore è l'ipotesi di partenza. */}
              <div className="rounded-md border border-dashed p-3">
                <p className="stat-label flex items-center gap-1">
                  Durata ed esito
                  <MetricInfo info={holdingTimeInfo} />
                </p>
                {holding.lowSample ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Servono {HOLDING_MIN_TRADES} trade direzionali per misurare
                    la relazione: nel periodo ce ne sono {holding.sample}.
                  </p>
                ) : holding.correlation === null ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Relazione non misurabile: servono sia vincenti sia perdenti,
                    con durate diverse fra loro.
                  </p>
                ) : (
                  <>
                    <p
                      className={cn(
                        "mt-1 text-lg font-semibold tabular-nums",
                        Math.abs(Number(holding.correlation)) < 0.2
                          ? "text-muted-foreground"
                          : undefined,
                      )}
                    >
                      {formatRatio(holding.correlation)}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        su {holding.sample} trade direzionali
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.abs(Number(holding.correlation)) < 0.2
                        ? "Nessun legame apprezzabile fra quanto tieni un trade e come va a finire."
                        : Number(holding.correlation) > 0
                          ? "Tieni più a lungo i trade che vincono. Di solito non è merito dell'attesa: è lo stop che chiude presto i perdenti."
                          : "Più tieni un trade, peggio tende ad andare."}{" "}
                      Mediana vincenti{" "}
                      <strong>{formatDurationSec(holding.medianWinSec)}</strong>{" "}
                      · perdenti{" "}
                      <strong>{formatDurationSec(holding.medianLossSec)}</strong>.
                    </p>
                  </>
                )}
              </div>
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
