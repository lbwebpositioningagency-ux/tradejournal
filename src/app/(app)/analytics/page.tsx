import { PageHeader } from "@/components/layout/page-header";
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
import { withCurrencyParam } from "@/lib/currency-nav";
import { formatNumber } from "@/lib/format-number";
import { getCurrencyBreakdown } from "@/lib/queries/stats";
import {
  getAnalyticsSymbols,
  getPlanCoverage,
  getRHistogram,
  getTargetRBuckets,
  getHourPerformance,
  HOUR_BASES,
  type HourBasis,
  getDurationPerformance,
  getDurationOutcomes,
  getRollingTradeWindow,
  getProAggregates,
  getStrategyDayPnl,
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
  aggregateStrategySeries,
  correlationAvailability,
  correlationEligible,
  correlationMatrix,
  correlationInfo,
  CORRELATION_MIN_OBSERVATIONS,
  EXTREME_MIN_TRADES,
  currentEpisodePosition,
  drawdownDurationInfo,
  drawdownDurationSummary,
  drawdownEpisodes,
  DRAWDOWN_DEPTH_FILTERS,
  DRAWDOWN_EPISODES_MIN,
  type DrawdownDepthKey,
  equityFitInfo,
  equityLinearFit,
  expectedLongestRun,
  kellyFraction,
  kellyInfo,
  optimalF,
  payoffRatio,
  valueAtRisk,
  valueAtRiskInfo,
  VAR_MIN_OBSERVATIONS,
  streakDistribution,
  streakDistributionInfo,
  winRate as winRateOf,
  winRateMargin,
} from "@/lib/metrics";
import { ConcentrationTable } from "@/components/analytics/concentration-table";
import {
  CorrelationMatrixTable,
  CorrelationPairsTable,
  CorrelationUnavailable,
} from "@/components/analytics/correlation-matrix";
import { todayKeyInZone } from "@/lib/dates";
import { DrawdownEpisodesTable } from "@/components/analytics/drawdown-episodes-table";
import { CurrentDrawdown } from "@/components/analytics/current-drawdown";
import { SegmentedNav } from "@/components/ui/segmented";
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
  DrawdownDurationChart,
  EquitySimulator,
  RDistributionChart,
  RollingRatioChart,
  RollingTradeChart,
  SegmentPerformanceChart,
  StreakDistributionChart,
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
  formatRMultiple,
  formatSignedMoney,
} from "@/lib/money";
import { formatDurationSec } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import { Activity, BarChart3, ChevronRight, Crosshair, Target } from "lucide-react";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { TargetRTable } from "@/components/analytics/target-r-table";
import { Capitolo, PannelloAnalisi } from "@/components/analytics/pannello-analisi";

export const metadata: Metadata = { title: "Analytics" };

/**
 * ANALYTICS — le analisi che non stanno in un widget.
 *
 * §3: distribuzione dei ritorni per target R. Le grandezze arrivano tutte
 * dalla stessa fonte di verità del resto dell'app (`rMultiple` e `targetR`
 * denormalizzati dalla pipeline): qui si aggrega e si mostra, non si
 * ricalcola.
 */
/**
 * Una delle cinque METRICHE PRO della sintesi in testa. Sotto 640px etichetta
 * e valore stanno sulla stessa riga (la sintesi resta corta su mobile); sopra,
 * valore sotto l'etichetta. Prima era `StatBox`, un riquadro con bordo dentro
 * una card.
 */
function CellaPro({
  label,
  value,
  sub,
  tone,
  info,
  accountScoped = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "profit" | "loss";
  info?: React.ComponentProps<typeof MetricInfo>["info"];
  /**
   * true = metrica di CONTO con un filtro strumento/direzione ATTIVO: va
   * detto sulla cella, altrimenti il numero che non si muove sembra un bug e
   * non una scelta. Lo decide il chiamante, che conosce i filtri.
   */
  accountScoped?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 bg-card px-4 py-3 sm:block",
        className,
      )}
    >
      <div className="stat-label flex items-center gap-1">
        {label}
        {info ? <MetricInfo info={info} /> : null}
      </div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums sm:mt-1 sm:text-xl",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="col-span-2 mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
      {accountScoped ? <AccountScopeNote className="col-span-2 mt-1.5" /> : null}
    </div>
  );
}

/**
 * Tabella di dettaglio chiusa sotto il suo grafico, con il numero di righe
 * nel comando: chi apre sa quanto è lunga prima di aprirla.
 */
function TabellaChiusa({
  righe,
  unita,
  children,
}: {
  righe: number;
  unita: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group/tabella border-t pt-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight
          className="size-3.5 transition-transform group-open/tabella:rotate-90"
          aria-hidden
        />
        Tabella completa · {righe} {unita}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
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
const formatRatio = (value: string) => formatNumber(value, { decimals: 2 });

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

  // Le metriche di CONTO (rolling, R², Kelly, simulatore)
  // leggono l'equity intera e non possono rispettare un filtro strumento o
  // direzione. Con un filtro attivo lo dichiarano sulla card.
  const instrumentFilterActive = symbol !== undefined || direction !== undefined;

  const filter: AnalyticsFilter = {
    ...base,
    currency: currencyScope.active,
    symbol,
    direction,
  };

  // Q-13 — Kelly, optimal f e gli aggregati R dei default del
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
    concentrationRow,
    rollingRows,
  ] = await Promise.all([
    coveragePromise,
    getTargetRBuckets(filter),
    getRHistogram(filter),
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
    getTopConcentration(filter),
    rollingRowsPromise,
  ]);
  const startingEquity = new Decimal(mcStartBalance).plus(mcLifetime).toFixed(2);

  const buckets = targetRBucketStats(bucketRows);
  const totals = targetRTotals(buckets);
  const histogramPoints = fillRDistribution(histogram, BE_BIN);

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

  /* Durata dei drawdown: gli episodi si tagliano sulla STESSA serie
     giornaliera di rolling e VaR (metrica di conto, parte dall'equity a
     inizio periodo). La soglia di profondità arriva dall'URL con parsing
     lenient: un valore sconosciuto torna a «Tutti». */
  const depthKey: DrawdownDepthKey =
    DRAWDOWN_DEPTH_FILTERS.find((f) => f.key === params.ddp)?.key ?? "0";
  const depthFilter = DRAWDOWN_DEPTH_FILTERS.find((f) => f.key === depthKey)!;
  const ddSummary = drawdownDurationSummary(
    drawdownEpisodes(returnsSeries, seriesEquity),
    depthFilter.minPct,
  );
  // Fase 5: l'episodio in corso contro i chiusi della stessa soglia; null se
  // nessun episodio è aperto (o se non supera la soglia di profondità).
  const ddCurrent = currentEpisodePosition(ddSummary);
  const depthHref = (key: DrawdownDepthKey) => {
    const query = new URLSearchParams();
    for (const [k, value] of Object.entries(params)) {
      if (typeof value === "string" && k !== "ddp") query.set(k, value);
    }
    if (key !== "0") query.set("ddp", key);
    const qs = query.toString();
    return `/analytics${qs ? `?${qs}` : ""}#rischio`;
  };
  const worstDuration = ddSummary.closed.reduce<(typeof ddSummary.closed)[number] | null>(
    (acc, e) => (acc === null || e.durationSessions > acc.durationSessions ? e : acc),
    null,
  );
  const worstRecovery = ddSummary.closed.reduce<(typeof ddSummary.closed)[number] | null>(
    (acc, e) => (acc === null || e.recoverySessions > acc.recoverySessions ? e : acc),
    null,
  );

  /* Matrice di correlazione fra strategie (rev. 16/09/2026): i P&L
     giornalieri per strategia (SQL) si sommano per SETTIMANA, l'unico
     periodo (il mese, tolto, lasciava troppo pochi periodi utili). Entrano
     solo le settimane intere dentro l'intervallo: senza fine esplicita, fino
     a oggi, così la settimana in corso resta fuori finché non è finita. */
  const corrMin = CORRELATION_MIN_OBSERVATIONS;
  const todayKey = todayKeyInZone(user.timezone);
  const corrRange = {
    fromKey: period.fromKey,
    toKey: period.toKey !== undefined && period.toKey < todayKey ? period.toKey : todayKey,
  };
  const corrAggregated = aggregateStrategySeries(strategyDays, corrRange);
  const corrAll = correlationMatrix(corrAggregated.series);
  const corrAvailability = correlationAvailability(corrAll);
  // Nella heatmap le strategie con almeno `corrMin` settimane operate: sotto,
  // nessuna loro coppia arriva alla soglia. Le escluse si nominano.
  const strategySeries = corrAggregated.series.filter((s) => correlationEligible(s));
  const excludedStrategies = corrAggregated.series.filter((s) => !correlationEligible(s));
  const correlations = correlationMatrix(strategySeries);

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
  // Fase 4: migliore e peggiore solo con intervalli dell'expectancy in R
  // disgiunti — valori diversi con intervalli sovrapposti non si distinguono.
  const bestHour = bestAndWorst(hourSegments, (s) => s.avgR, {
    interval: (s) => s.avgRInterval,
  });
  const bestDuration = bestAndWorst(durationSegments, (s) => s.avgR, {
    interval: (s) => s.avgRInterval,
  });

  const senzaR = coverage.total - coverage.withR;
  const senzaPiano = coverage.withR - coverage.withTargetR;

  const baseOraria = hourBasis === "close" ? "chiusura" : "apertura";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Analytics"
        description={<>Distribuzioni, rischio, rolling e timing · {period.label}</>}
        actions={
          <>
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
          </>
        }
      />
      <Suspense fallback={<div className="h-9" />}>
        <AnalyticsFilters symbols={symbols} symbol={symbol} direction={direction} />
      </Suspense>

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
                  href={withCurrencyParam(
                    "/trades?risk=missing",
                    currencyScope.multi ? currencyScope.active : undefined,
                  )}
                  className="underline underline-offset-2"
                >
                  {senzaR} senza rischio
                </Link>
                : R non calcolabile (N/D)
                {/* Il conteggio da solo non basta: si dichiara anche il DENARO
                    che resta fuori dall'istogramma. */}
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

          {/* ── SINTESI: le cinque metriche pro, in testa ─────────────────────
              Erano a metà pagina. Salgono in cima perché sono le sole che la
              pagina riassume in un numero; nessuna metrica nuova. Griglia senza
              orfani (tavola, riquadro 4): 1 colonna · 2 + 2 + la quinta su due
              · 5 in riga. */}
          <section aria-labelledby="sintesi-titolo" className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-3">
              <h2 id="sintesi-titolo" className="stat-label">
                In sintesi · metriche pro
              </h2>
              <p className="text-xs text-muted-foreground">
                Le metriche di base (Sortino, Calmar, profit factor, payoff,
                streak) restano in dashboard: qui ci sono quelle che servono a
                decidere, non a fotografare.
              </p>
            </div>
            <div className="mt-3 grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-5">
              <CellaPro
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
              <CellaPro
                label="Regolarità equity (R²)"
                value={equityFit.r2 === null ? "—" : formatPercent(equityFit.r2)}
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
              <CellaPro
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
              <CellaPro
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
              <CellaPro
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
                className="sm:col-span-2 xl:col-span-1"
              />
            </div>
            <details className="group/metodo border-t px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className="size-3.5 transition-transform group-open/metodo:rotate-90"
                  aria-hidden
                />
                Metodo · Kelly e optimal f non sono size consigliate
              </summary>
              <div className="mt-2 flex max-w-prose flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">
                    Kelly e optimal f non sono size consigliate.
                  </strong>{" "}
                  Sono il limite oltre il quale nessuna teoria ti dà ragione.
                  Kelly è una metrica di CONTO: ignora i filtri simbolo/direzione
                  (come le rolling annualizzate) e i breakeven non entrano nel
                  lancio della moneta (p = vincite / (vincite + perdite)).
                </p>
                <p>
                  Cerchi la performance per giorno della settimana? Sta in{" "}
                  <Link href="/reports" className="underline underline-offset-2">
                    Reports
                  </Link>{" "}
                  e non è duplicata qui: stesse colonne, un posto solo.
                </p>
              </div>
            </details>
          </section>

          {/* Nessun indice dei capitoli (15/09/2026, tavola «Analytics -
              ricostruzione - applicata», decisione 3): la colonna ferma a
              sinistra toglieva larghezza a grafici e tabelle. I capitoli
              restano come titoli. */}
          <div className="flex min-w-0 flex-col gap-8">
              {/* ── DISTRIBUZIONI ─────────────────────────────────────────── */}
              <Capitolo
                id="distribuzioni"
                titolo="Distribuzioni"
                sottotitolo="come si distribuiscono i ritorni in R, e cosa rende puntare più lontano"
              >
                <div className="flex flex-col gap-4">
                  {/* ① Istogramma dell'R realizzato su TUTTI i trade con rischio. */}
                  <PannelloAnalisi
                    titolo="Distribuzione dell'R realizzato"
                    info={returnDistributionInfo}
                    meta={
                      <>
                        Fasce da 0,5R su {coverage.withR} trade con rischio
                        definito. Colonna BE dedicata per l&apos;R esattamente
                        zero.
                      </>
                    }
                  >
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
                  </PannelloAnalisi>

                  {/* ② Segmentazione per bucket di target R. */}
                  <PannelloAnalisi
                    titolo="Ritorni per target R"
                    info={hitRateInfo}
                    meta={
                      totals.trades > 0 ? (
                        <>
                          Nel periodo: {totals.trades} trade con piano,{" "}
                          {totals.hitRate !== null && formatPercent(totals.hitRate)} al
                          target,{" "}
                          {totals.expectancyR !== null &&
                            formatRMultiple(totals.expectancyR)}{" "}
                          di attesa per trade.
                        </>
                      ) : undefined
                    }
                    metodo={
                      <p>
                        Puntare più lontano alza il ritorno per trade riuscito e
                        abbassa l&apos;hit rate: la colonna che decide è
                        l&apos;expectancy.
                      </p>
                    }
                  >
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
                  </PannelloAnalisi>
                </div>
              </Capitolo>

              {/* ── RISCHIO ───────────────────────────────────────────────── */}
              <Capitolo
                id="rischio"
                titolo="Rischio"
                sottotitolo="quanto si resta sotto il massimo, serie consecutive, concentrazione del profitto, strategie che si muovono insieme"
              >
                <div className="flex flex-col gap-4">
                  {/* Durata dei drawdown (tavola CD «Analytics - durata
                      drawdown e correlazione», riquadri 1-2). In testa al
                      capitolo: è la domanda più vicina all'esperienza. */}
                  <PannelloAnalisi
                    titolo="Durata dei drawdown"
                    info={drawdownDurationInfo}
                    azioni={
                      <SegmentedNav
                        label="Profondità minima degli episodi"
                        scroll={false}
                        items={DRAWDOWN_DEPTH_FILTERS.map((f) => ({
                          key: f.key,
                          href: depthHref(f.key),
                          label: f.label,
                          active: f.key === depthKey,
                        }))}
                      />
                    }
                    meta={
                      <>
                        {ddSummary.closed.length}{" "}
                        {ddSummary.closed.length === 1 ? "episodio chiuso" : "episodi chiusi"}{" "}
                        nel periodo
                        {depthFilter.minPct !== null &&
                          ` oltre il ${depthFilter.label.replace("Oltre ", "")} di profondità (${ddSummary.belowDepth} più lievi esclusi)`}
                        , in sedute. Durata: dal massimo al ritorno sul massimo · recupero:
                        dal punto più basso al ritorno.
                        {instrumentFilterActive ? <AccountScopeNote className="mt-2" /> : null}
                      </>
                    }
                    metodo={
                      <>
                        <p>
                          Un episodio parte dall&apos;ultimo massimo dell&apos;equity e
                          finisce la prima seduta in cui l&apos;equity torna a quel
                          massimo o sopra. Le sedute sono quelle della serie
                          giornaliera di Sharpe e VaR: giorni feriali, quelli senza
                          trade a P&amp;L zero. Un drawdown iniziato prima del periodo
                          selezionato si conta dal primo giorno del periodo.
                        </p>
                        <p>
                          Le durate hanno una coda lunga a destra — tanti episodi da
                          due o tre sedute, pochi da decine — quindi si leggono per
                          fasce e mediana, non con media e deviazione standard.
                          Mediana e istogramma compaiono da {DRAWDOWN_EPISODES_MIN}{" "}
                          episodi chiusi: sotto, la forma della distribuzione è la
                          forma del caso. L&apos;episodio ancora aperto non entra nei
                          conteggi, perché la sua durata è solo un minimo.
                        </p>
                      </>
                    }
                  >
                    {ddSummary.closed.length === 0 && ddSummary.open === null ? (
                      <EmptyState
                        compact
                        icon={Activity}
                        title="Nessun drawdown nel periodo"
                        description={
                          depthFilter.minPct === null
                            ? "L'equity non è mai scesa sotto un suo massimo precedente."
                            : "Nessun episodio supera la soglia di profondità scelta."
                        }
                      />
                    ) : (
                      <>
                        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
                          <CellaPro
                            label="Durata tipica"
                            value={
                              ddSummary.duration.median === null
                                ? "—"
                                : `${formatNumber(ddSummary.duration.median, { decimals: ddSummary.duration.median.includes(".") ? 1 : 0 })} sedute`
                            }
                            sub={
                              ddSummary.lowSample
                                ? `campione insufficiente: servono ${DRAWDOWN_EPISODES_MIN} episodi chiusi, ce ne sono ${ddSummary.closed.length}`
                                : `mediana di ${ddSummary.closed.length} episodi`
                            }
                          />
                          <CellaPro
                            label={ddSummary.lowSample ? "Durata più lunga finora" : "Durata più lunga"}
                            value={worstDuration ? `${worstDuration.durationSessions} sedute` : "—"}
                            sub={
                              worstDuration === null
                                ? "nessun episodio chiuso"
                                : ddSummary.lowSample
                                  ? `su ${ddSummary.closed.length} ${ddSummary.closed.length === 1 ? "episodio" : "episodi"}: troppo pochi per dire quanto può durare`
                                  : `su ${ddSummary.closed.length} episodi · profondità ${formatPercent(worstDuration.depthPct === null ? null : `-${worstDuration.depthPct}`)}`
                            }
                          />
                          <CellaPro
                            label="Recupero tipico"
                            value={
                              ddSummary.recovery.median === null
                                ? "—"
                                : `${formatNumber(ddSummary.recovery.median, { decimals: ddSummary.recovery.median.includes(".") ? 1 : 0 })} sedute`
                            }
                            sub={
                              ddSummary.lowSample
                                ? "campione insufficiente"
                                : `mediana di ${ddSummary.closed.length} episodi`
                            }
                          />
                          <CellaPro
                            label={ddSummary.lowSample ? "Recupero più lungo finora" : "Recupero più lungo"}
                            value={worstRecovery ? `${worstRecovery.recoverySessions} sedute` : "—"}
                            sub={
                              worstRecovery === null
                                ? "nessun episodio chiuso"
                                : `su ${ddSummary.closed.length} ${ddSummary.closed.length === 1 ? "episodio" : "episodi"}`
                            }
                          />
                        </div>

                        {ddSummary.lowSample ? (
                          <p className="text-xs text-muted-foreground">
                            Niente istogramma sotto {DRAWDOWN_EPISODES_MIN} episodi
                            chiusi: con {ddSummary.closed.length} osservazioni la forma
                            della distribuzione è quella del caso. Gli episodi sono
                            tutti nella tabella qui sotto.
                          </p>
                        ) : (
                          <DrawdownDurationChart bands={ddSummary.bands} />
                        )}

                        {/* Fase 5 — l'episodio in corso contro la storia
                            (tavola «Analytics - fase 5 - drawdown in corso»). */}
                        {ddCurrent ? (
                          <CurrentDrawdown
                            position={ddCurrent}
                            closedDurations={ddSummary.closed.map((e) => e.durationSessions)}
                            lastDay={returnsSeries.at(-1)?.day ?? null}
                          />
                        ) : null}

                        {ddSummary.lowSample ? (
                          <DrawdownEpisodesTable
                            episodes={ddSummary.closed}
                            open={ddSummary.open}
                            currency={currency}
                          />
                        ) : (
                          <TabellaChiusa
                            righe={ddSummary.closed.length + (ddSummary.open ? 1 : 0)}
                            unita={ddSummary.open ? "episodi (uno in corso)" : "episodi"}
                          >
                            <DrawdownEpisodesTable
                              episodes={ddSummary.closed}
                              open={ddSummary.open}
                              currency={currency}
                            />
                          </TabellaChiusa>
                        )}
                      </>
                    )}
                  </PannelloAnalisi>

                  {/* §3 — distribuzione delle lunghezze di streak. */}
                  <PannelloAnalisi
                    titolo="Distribuzione delle streak"
                    info={streakDistributionInfo}
                    meta={
                      streaks.longestLoss > 0 && expectedLossRun !== null ? (
                        <>
                          La tua serie di perdite più lunga è di{" "}
                          <strong className="text-foreground">{streaks.longestLoss}</strong>{" "}
                          trade, contro le{" "}
                          <strong className="text-foreground">
                            {formatNumber(expectedLossRun, { decimals: 1 })}
                          </strong>{" "}
                          che il puro caso produrrebbe su {proAgg.total} trade con
                          il tuo win rate
                          {new Decimal(streaks.longestLoss).lte(
                            new Decimal(expectedLossRun).plus(1),
                          )
                            ? ": dentro la norma, non è successo niente al tuo sistema."
                            : ": più lunga dell'attesa, ma il confronto assume trade indipendenti."}
                        </>
                      ) : undefined
                    }
                    metodo={
                      <p>
                        Quante volte è capitata una serie di 2, 3, 5 trade
                        consecutivi dello stesso segno. I breakeven spezzano le
                        serie.
                      </p>
                    }
                  >
                    {streaks.bars.length > 0 ? (
                      <>
                        <StreakDistributionChart bars={streaks.bars} />
                        <p className="text-xs text-muted-foreground">
                          {streaks.winRuns} serie di vincite (la più lunga{" "}
                          {streaks.longestWin}
                          {expectedWinRun !== null &&
                            `, attesa ${formatNumber(expectedWinRun, { decimals: 1 })}`}
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
                  </PannelloAnalisi>

                  {/* §3 — concentrazione del profitto. */}
                  <PannelloAnalisi
                    titolo="Concentrazione del profitto"
                    info={concentrationInfo}
                    meta={
                      <>
                        Quanta parte del profitto lordo (
                        {formatMoney(profitConcentration.grossProfit, currency)} su{" "}
                        {profitConcentration.winners} trade vincenti) viene dai
                        migliori, e cosa resterebbe togliendoli.
                      </>
                    }
                  >
                    {profitConcentration.slices.length > 0 ? (
                      <ConcentrationTable data={profitConcentration} currency={currency} />
                    ) : (
                      <EmptyState
                        compact
                        icon={Target}
                        title="Nessun trade vincente nel periodo"
                        description="La concentrazione si misura sul profitto lordo: senza vincenti non c'è nulla da ripartire."
                      />
                    )}
                  </PannelloAnalisi>
                </div>

                {/* Correlazione fra strategie: le strategie guardate INSIEME. */}
                <PannelloAnalisi
                  className="mt-4"
                  titolo="Correlazione fra strategie"
                  info={correlationInfo}
                  meta={
                    <>
                      Coefficiente sui P&amp;L sommati per settimana, calcolato
                      sulle settimane in cui le due strategie hanno operato
                      entrambe: ogni cella dice quante sono.
                      {corrAvailability.usable && (
                        <>
                          {" "}
                          {strategySeries.length}{" "}
                          {strategySeries.length === 1 ? "strategia" : "strategie"} con almeno{" "}
                          {corrMin} settimane operate nel periodo.
                          {excludedStrategies.length > 0 && (
                            <>
                              {" "}
                              Fuori perché operate meno di{" "}
                              {corrMin} settimane:{" "}
                              {excludedStrategies
                                .map((s) => `${s.label} (${s.byPeriod.size})`)
                                .join(", ")}
                              .
                            </>
                          )}
                        </>
                      )}
                      {corrAggregated.partialPeriods > 0 && (
                        <>
                          {" "}
                          {corrAggregated.partialPeriods}{" "}
                          {corrAggregated.partialPeriods === 1 ? "settimana tagliata" : "settimane tagliate"}{" "}
                          dal periodo selezionato, o non ancora finite, fuori dal calcolo.
                        </>
                      )}
                    </>
                  }
                  metodo={
                    <>
                      <p>
                        <strong className="text-foreground">Settimane.</strong>{" "}Settimana di
                        calendario, dal lunedì al venerdì (un trade chiuso nel weekend resta
                        nella sua settimana). Conta il giorno di chiusura nel tuo fuso. Entrano
                        solo le settimane intere dentro l&apos;intervallo selezionato: una
                        settimana tagliata dal filtro, o non ancora finita, somma meno sedute
                        delle altre e resta fuori.
                      </p>
                      <p>
                        <strong className="text-foreground">Settimane senza attività: escluse.</strong>{" "}
                        Il coefficiente si calcola solo sulle settimane in cui{" "}
                        <strong className="text-foreground">entrambe</strong>{" "}hanno operato.
                        Quelle in cui ne opera una sola non entrano con uno zero: lo zero è
                        un&apos;assenza, non un risultato, e legherebbe il numero a quando si
                        opera invece che a come va. Così le osservazioni del calcolo sono le
                        stesse contate dalla soglia e dalla banda di rumore.
                      </p>
                      <p>
                        <strong className="text-foreground">Soglia: {corrMin} settimane in comune.</strong>{" "}
                        L&apos;incertezza di una correlazione dipende da quante osservazioni
                        ci sono, non da quanto dura ognuna: con 30 una correlazione nulla
                        oscilla di ±0,36, e una vera di 0,5 si riconosce otto volte su
                        dieci. Sotto soglia la cella non mostra un numero.
                      </p>
                      <p>
                        La tinta tiene il segno: le due che si muovono insieme (tinta
                        perdita) moltiplicano il rischio, quelle che si compensano (tinta
                        profitto) lo riducono. Un valore dentro la banda di rumore
                        ±1,96/√settimane in comune — ±0,36 con 30, ±0,25 con 60 — non si
                        distingue da zero e resta neutro.
                      </p>
                    </>
                  }
                >
                  {corrAvailability.closest === null ? (
                    <EmptyState
                      compact
                      icon={Crosshair}
                      title="Servono almeno due strategie con storia"
                      description={`La correlazione confronta strategie fra loro: servono almeno due strategie operate in settimane intere del periodo.`}
                    />
                  ) : !corrAvailability.usable ? (
                    <>
                      <CorrelationUnavailable
                        closest={corrAvailability.closest}
                        labels={corrAll.labels}
                        periods={corrAggregated.periods}
                      />
                      <TabellaChiusa righe={corrAll.pairs.size} unita="coppie">
                        <CorrelationPairsTable matrix={corrAll} />
                      </TabellaChiusa>
                    </>
                  ) : (
                    <>
                      <CorrelationMatrixTable matrix={correlations} />
                      <TabellaChiusa righe={correlations.pairs.size} unita="coppie">
                        <CorrelationPairsTable matrix={correlations} />
                      </TabellaChiusa>
                    </>
                  )}
                </PannelloAnalisi>
              </Capitolo>

              {/* ── ROLLING ───────────────────────────────────────────────── */}
              <Capitolo
                id="rolling"
                titolo="Rolling"
                sottotitolo="come cambiano i ratio sulle sedute e le metriche su finestre di trade"
              >
                <div className="flex flex-col gap-4">
                  {/* §2 — rolling Sharpe/Sortino sui RITORNI giornalieri. */}
                  <PannelloAnalisi
                    titolo="Sharpe e Sortino rolling"
                    info={rollingRatiosInfo}
                    azioni={
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
                    }
                    meta={
                      <>
                        {dayWindow
                          ? `Finestra mobile di ${dayWindow} sedute, annualizzata ×√252 (${ratioPoints.length} finestre piene).`
                          : "Servono almeno 60 sedute nel periodo selezionato."}
                        {instrumentFilterActive ? <AccountScopeNote className="mt-2" /> : null}
                      </>
                    }
                    metodo={
                      <>
                        <p>
                          Ritorno di una giornata = P&amp;L del giorno ÷ equity a
                          inizio giornata; le sedute senza trade entrano a ritorno
                          0 e il risk-free è 0. Il calcolo è sull&apos;intero
                          conto, perché l&apos;equity non è di un singolo
                          strumento.
                        </p>
                        <p>
                          Questi due valori{" "}
                          <strong className="text-foreground">
                            non coincidono con lo Sharpe e il Sortino della
                            dashboard
                          </strong>
                          : quelli sono calcolati sui P&amp;L giornalieri in valuta
                          e non sono annualizzati, quindi cambiano se cambia la
                          dimensione del conto. Qui si parte dai ritorni, che sono
                          confrontabili fra conti di taglia diversa e con
                          qualunque altra strategia.
                        </p>
                      </>
                    }
                  >
                    {ratioPoints.length > 0 ? (
                      <>
                        <RollingRatioChart points={ratioPoints} />
                        <MetricRangeStrip rows={ratioRangeRows} />
                        <FewWindowsNote count={ratioPoints.length} unit="finestre" />
                      </>
                    ) : (
                      <EmptyState
                        compact
                        icon={Activity}
                        title="Storico troppo corto per una finestra mobile"
                        description="Servono almeno 60 sedute (giorni feriali dal primo all'ultimo trade del periodo) perché una sola finestra sia piena."
                      />
                    )}
                  </PannelloAnalisi>

                  {/* §2 — metriche journal su finestra a NUMERO DI TRADE. */}
                  <PannelloAnalisi
                    titolo="Metriche rolling per finestra di trade"
                    info={rollingTradeInfo}
                    azioni={
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
                    }
                    meta={
                      tradeWindow
                        ? `Ogni punto riassume i ${tradeWindow} trade fino a quello (${tradePoints.length} punti mostrati).`
                        : "Servono almeno 50 trade chiusi nel periodo selezionato."
                    }
                    metodo={
                      <p>
                        La finestra è a numero di trade, non a giorni: una pausa
                        dall&apos;operatività non diluisce il dato. Una metrica
                        alla volta, perché win rate, R, valuta e profit factor non
                        stanno sulla stessa scala.
                      </p>
                    }
                  >
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
                  </PannelloAnalisi>
                </div>
              </Capitolo>

              {/* ── TIMING ────────────────────────────────────────────────── */}
              <Capitolo
                id="timing"
                titolo="Timing"
                sottotitolo="quando entri e quanto tieni aperto il trade"
              >
                {/* La tabella di dettaglio di ciascun pannello è chiusa sotto il
                    grafico: il grafico porta la stessa serie, la tabella aggiunge
                    win rate, PF e P&L per fascia a chi la apre (tavola
                    «Analytics - ricostruzione - applicata», decisione 1). */}
                <div className="flex flex-col gap-4">
                  {/* §2 — performance per fascia oraria: apertura O chiusura. */}
                  <PannelloAnalisi
                    titolo="Performance per fascia oraria"
                    info={hourPerformanceInfo}
                    azioni={<HourBasisToggle basis={hourBasis} hrefFor={hourBasisHref} />}
                    meta={
                      <>
                        Fasce di un&apos;ora sull&apos;orario di{" "}
                        <strong className="text-foreground">{baseOraria}</strong> del
                        trade, nel tuo fuso ({user.timezone.replace("_", " ")}).{" "}
                        {hourBasis === "close"
                          ? "Quando esci bene: è una domanda sulla gestione."
                          : "Quando entri bene: è una domanda sul setup."}
                        {bestHour.best && bestHour.worst ? (
                          <>
                            {" "}
                            Migliore <strong className="text-foreground">{bestHour.best.label}</strong> (
                            {formatRMultiple(bestHour.best.avgR!)} su{" "}
                            {bestHour.best.total} trade) · peggiore{" "}
                            <strong className="text-foreground">{bestHour.worst.label}</strong> (
                            {formatRMultiple(bestHour.worst.avgR!)} su{" "}
                            {bestHour.worst.total}). Eletti fra le {bestHour.eligible} fasce
                            con almeno {EXTREME_MIN_TRADES} trade: le altre restano nel
                            grafico, più chiare, senza etichetta.
                          </>
                        ) : bestHour.overlapping ? (
                          <>
                            {" "}
                            Nessuna fascia eletta migliore o peggiore: la più alta (
                            <strong className="text-foreground">{bestHour.overlapping.high.label}</strong>,{" "}
                            {formatRMultiple(bestHour.overlapping.high.avgR!)}, intervallo{" "}
                            {formatRMultiple(bestHour.overlapping.high.avgRInterval!.lower)} –{" "}
                            {formatRMultiple(bestHour.overlapping.high.avgRInterval!.upper)}) e la più
                            bassa (
                            <strong className="text-foreground">{bestHour.overlapping.low.label}</strong>,{" "}
                            {formatRMultiple(bestHour.overlapping.low.avgR!)}, intervallo{" "}
                            {formatRMultiple(bestHour.overlapping.low.avgRInterval!.lower)} –{" "}
                            {formatRMultiple(bestHour.overlapping.low.avgRInterval!.upper)}) hanno
                            intervalli che si sovrappongono: non si distinguono.
                          </>
                        ) : bestHour.withTrades > 0 ? (
                          ` Nessuna fascia eletta migliore o peggiore: ne servono almeno due con ${EXTREME_MIN_TRADES} trade e un intervallo (${bestHour.eligible} nel periodo).`
                        ) : null}
                      </>
                    }
                  >
                    <SegmentPerformanceChart
                      points={hourSegments}
                      currency={currency}
                      ariaLabel={`Performance per fascia oraria di ${baseOraria}`}
                    />
                    <TabellaChiusa righe={hourSegments.filter((s) => !s.empty).length} unita="fasce">
                      <SegmentTable
                        rows={hourSegments.filter((s) => !s.empty)}
                        currency={currency}
                        segmentLabel={`Ora di ${baseOraria}`}
                      />
                    </TabellaChiusa>
                  </PannelloAnalisi>

                  {/* §3 — performance per durata del trade. */}
                  <PannelloAnalisi
                    titolo="Performance per durata"
                    info={durationPerformanceInfo}
                    meta={
                      bestDuration.best && bestDuration.worst ? (
                        <>
                          Migliore <strong className="text-foreground">{bestDuration.best.label}</strong> (
                          {formatRMultiple(bestDuration.best.avgR!)} su {bestDuration.best.total} trade) ·
                          peggiore{" "}
                          <strong className="text-foreground">{bestDuration.worst.label}</strong> (
                          {formatRMultiple(bestDuration.worst.avgR!)} su {bestDuration.worst.total}).
                          Eletti fra le {bestDuration.eligible} fasce con almeno{" "}
                          {EXTREME_MIN_TRADES} trade.
                        </>
                      ) : bestDuration.overlapping ? (
                        <>
                          Nessuna durata eletta migliore o peggiore: la più alta (
                          <strong className="text-foreground">{bestDuration.overlapping.high.label}</strong>,{" "}
                          {formatRMultiple(bestDuration.overlapping.high.avgR!)}, intervallo{" "}
                          {formatRMultiple(bestDuration.overlapping.high.avgRInterval!.lower)} –{" "}
                          {formatRMultiple(bestDuration.overlapping.high.avgRInterval!.upper)}) e la più
                          bassa (
                          <strong className="text-foreground">{bestDuration.overlapping.low.label}</strong>,{" "}
                          {formatRMultiple(bestDuration.overlapping.low.avgR!)}, intervallo{" "}
                          {formatRMultiple(bestDuration.overlapping.low.avgRInterval!.lower)} –{" "}
                          {formatRMultiple(bestDuration.overlapping.low.avgRInterval!.upper)}) hanno
                          intervalli che si sovrappongono: non si distinguono.
                        </>
                      ) : bestDuration.withTrades > 0 ? (
                        `Nessuna durata eletta migliore o peggiore: ne servono almeno due con ${EXTREME_MIN_TRADES} trade e un intervallo (${bestDuration.eligible} nel periodo).`
                      ) : undefined
                    }
                    metodo={
                      <p>
                        Quanto rende il trade al variare di quanto lo tieni aperto
                        (chiusura − apertura). I confini delle fasce sono tarati
                        sulla distribuzione reale dei trade, non fissati a priori.
                      </p>
                    }
                  >
                    <SegmentPerformanceChart
                      points={durationSegments}
                      currency={currency}
                      ariaLabel="Performance per durata del trade"
                    />
                    <TabellaChiusa righe={durationSegments.length} unita="fasce">
                      <SegmentTable rows={durationSegments} currency={currency} segmentLabel="Durata" />
                    </TabellaChiusa>

                    {/* La lettura d'insieme, che nessuna riga della tabella può
                        dare: con sette fasce e poche decine di trade per fascia
                        il rumore è l'ipotesi di partenza. */}
                    <div className="border-t pt-3">
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
                          Relazione non misurabile: servono sia vincenti sia
                          perdenti, con durate diverse fra loro.
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
                  </PannelloAnalisi>
                </div>
              </Capitolo>

              {/* ── SIMULATORE ────────────────────────────────────────────── */}
              <Capitolo
                id="simulatore"
                titolo="Simulatore"
                sottotitolo="uno strumento, non una statistica: percorsi possibili con i parametri del form"
              >
                {/* §1 — equity curve simulator (Fase 34, sostituisce il Monte
                    Carlo a bande percentili). */}
                <PannelloAnalisi
                  titolo="Equity curve simulator"
                  info={equitySimulatorInfo}
                  meta={
                    <>
                      Ogni linea colorata è un percorso possibile con i parametri
                      del form; la linea in grassetto è la media. I campi partono
                      dalle statistiche reali del conto nel periodo, ma sono tuoi:
                      cambiali per vedere come si muove il ventaglio.
                      {instrumentFilterActive ? <AccountScopeNote className="mt-2" /> : null}
                    </>
                  }
                  metodo={
                    <p>
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
                      probabilità e rapporto win/loss partono dai soli trade
                      vincenti/perdenti con rischio definito (p = R vincenti / (R
                      vincenti + R perdenti), ratio = R medio vincente / R medio
                      perdente), perché nel modello ogni non-vincita perde
                      l&apos;intero rischio. Non è un consiglio finanziario.
                    </p>
                  }
                >
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
                      simRatio !== null ? new Decimal(simRatio).toFixed(2) : "1.5"
                    }
                    currency={currency}
                  />
                </PannelloAnalisi>
              </Capitolo>
          </div>
        </>
      )}
    </div>
  );
}
