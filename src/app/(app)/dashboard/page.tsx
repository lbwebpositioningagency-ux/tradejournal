import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeAccountWhere } from "@/lib/active-account";
import { resolveTradeScope } from "@/lib/demo-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import {
  formatDateTime,
  secondsSince,
  todayKeyInZone,
  zonedInputToUtc,
} from "@/lib/dates";
import { addMonths } from "@/lib/calendar";
import { resolvePeriod } from "@/lib/period";
import { periodCookieFallback } from "@/lib/period-cookie";
import {
  avgLoss,
  avgWin,
  calmarRatio,
  coveredDays,
  dailyReturns,
  validReturnWindow,
  classifyOutcome,
  radarScore,
  underwaterSeries,
  currentDayStreak,
  currentStreak,
  dayStats,
  dayStreakSummary,
  expectancy,
  maxDrawdown,
  payoffRatio,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  sqn,
  streakSummary,
  ulcerIndex,
  winRate,
  monthlyReturnGrids,
} from "@/lib/metrics";
import {
  BE_BIN,
  getCurrencyBreakdown,
  getDailyPnl,
  getLifetimeNetPnl,
  getNetPnlBefore,
  getRDistribution,
  getPeriodPnl,
  getRecentTradeOutcomes,
  getStartingBalance,
  getTradeAggregates,
  getTradeSequence,
  type StatsFilter,
} from "@/lib/queries/stats";
import { fillRDistribution } from "@/lib/reports";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { getSessionBreakdown, getWeekdayBreakdown } from "@/lib/queries/reports";
import { fillSessionSeries } from "@/lib/sessions";
import { fillWeekdaySeries } from "@/lib/weekdays";
import { parseDashboardLayout } from "@/lib/validations/dashboard";
import {
  DashboardView,
  type DashboardData,
} from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    cur?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sessionUserId = session.user.id;

  const params = await searchParams;

  // Scope dei dati: coincide con l'utente loggato, tranne quando il conto
  // attivo è il demo globale SIM1 (allora le query sui trade girano
  // sull'utente di sistema). Gli artefatti PERSONALI — qui il profilo e il
  // layout dei widget — restano sempre dell'utente vero.
  const [user, tradeScope] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUserId },
      select: {
        timezone: true,
        baseCurrency: true,
        dashboardLayout: true,
      },
    }),
    resolveTradeScope(sessionUserId),
  ]);
  const userId = tradeScope.userId;
  const activeAccountId = tradeScope.accountId;

  // B3-4 — periodo ricordato dal cookie quando l'URL non ne porta uno esplicito.
  const period = resolvePeriod(params, user.timezone, undefined, await periodCookieFallback());

  const baseFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    from: period.from,
    to: period.to,
  };

  // F6 — prima si determinano le valute presenti nel periodo/scope e la valuta
  // attiva (mai sommare valute diverse), poi tutte le metriche girano ristrette
  // a quella valuta.
  const hasPeriod = Boolean(period.from || period.to);
  const [currencyTotals, lifetimeTotalsRaw, activeAccount, lifetimeTradeCount] =
    await Promise.all([
    getCurrencyBreakdown(baseFilter),
    // B-02 — valute presenti in TUTTO lo storico dello scope conto: i widget
    // lifetime (Saldo, mini-calendario, calendario mensile) risolvono la
    // valuta qui, mai sul periodo — altrimenti cambiando periodo il saldo
    // "balla" di perimetro. Senza filtro periodo la prima chiamata coincide.
    hasPeriod
      ? getCurrencyBreakdown({ userId, accountId: activeAccountId })
      : null,
    activeAccountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({
          where: { id: activeAccountId, userId },
          select: { currency: true },
        }),
    // F15 — onboarding: l'utente ha mai inserito un trade (qualsiasi
    // conto/stato)? P-04 — non dipende dalla valuta: parte in questo stadio
    // invece che nel successivo (query invariata, cambia solo quando parte).
    prisma.trade.count({ where: { account: { userId } } }),
  ]);
  const lifetimeTotals = lifetimeTotalsRaw ?? currencyTotals;
  // B-02 — periodo senza trade: lo scope di periodo ricade sulle valute
  // lifetime invece che su `undefined` — MAI una query di denaro senza
  // vincolo di valuta (sommerebbe valute diverse, il caso eliminato da F6).
  const scope = resolveCurrencyScope(
    currencyTotals.length > 0 ? currencyTotals : lifetimeTotals,
    params.cur,
  );
  const lifetimeScope = resolveCurrencyScope(lifetimeTotals, params.cur);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;
  const lifetimeCurrency =
    lifetimeScope.active ?? activeAccount?.currency ?? user.baseCurrency;

  // Filtro conto + valuta attiva per le query Prisma non-SQL (aperti, recenti).
  const accountWhere = tradeAccountWhere(userId, activeAccountId, scope.active);

  // F50 — "Ultimi trade" rispetta il filtro periodo: trade APERTI nel periodo
  // selezionato (openedAt). Con "Tutto lo storico" (from/to assenti) nessun
  // vincolo, come prima.
  const recentWhere =
    period.from || period.to
      ? {
          ...accountWhere,
          openedAt: {
            ...(period.from ? { gte: period.from } : {}),
            ...(period.to ? { lt: period.to } : {}),
          },
        }
      : accountWhere;

  // F26 — mini-calendario del mese CORRENTE (fuso utente), indipendente dal
  // filtro periodo come il Saldo conto; scope conto + valuta LIFETIME (B-02).
  const todayKey = todayKeyInZone(user.timezone);
  const currentMonth = todayKey.slice(0, 7);
  const monthFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    currency: lifetimeScope.active,
    from: zonedInputToUtc(`${currentMonth}-01T00:00`, user.timezone),
    to: zonedInputToUtc(`${addMonths(currentMonth, 1)}-01T00:00`, user.timezone),
  };

  const [
    agg,
    daily,
    monthDaily,
    outcomes,
    baseBalance,
    lifetimeBaseBalance,
    pnlBeforePeriod,
    lifetimeNetPnl,
    sequence,
    sessionRows,
    weekdayRows,
    rDistributionRows,
    openTradeRows,
    openTradeCount,
    recentTrades,
    monthlyRows,
  ] = await Promise.all([
      getTradeAggregates(filter),
      getDailyPnl(filter, user.timezone),
      getDailyPnl(monthFilter, user.timezone),
      getRecentTradeOutcomes(filter),
      getStartingBalance(filter),
      // B-02 — base del Saldo conto e del calendario mensile: saldi iniziali
      // dei conti nella valuta LIFETIME (indipendente dal periodo).
      getStartingBalance({
        userId,
        accountId: activeAccountId,
        currency: lifetimeScope.active,
      }),
      // Q-01 — equity a INIZIO periodo: il P&L chiuso prima di `from` va
      // sommato al saldo iniziale, altrimenti la curva del periodo riparte
      // dal saldo di apertura del conto e DD%/Ulcer/Calmar/underwater/Score
      // risultano gonfiati (stessa convenzione delle rolling di /analytics).
      getNetPnlBefore(
        { userId, accountId: activeAccountId, currency: scope.active },
        period.from,
      ),
      // B-02 — P&L storico del Saldo conto: stessa valuta lifetime della base.
      getLifetimeNetPnl({
        userId,
        accountId: activeAccountId,
        currency: lifetimeScope.active,
      }),
      getTradeSequence(filter),
      getSessionBreakdown(filter),
      getWeekdayBreakdown(filter, user.timezone),
      getRDistribution(filter),
      // F33 — posizioni aperte del conto/valuta attivi (non filtrate dal
      // periodo: una posizione aperta è "adesso" per definizione).
      prisma.trade.findMany({
        where: { ...accountWhere, status: "OPEN" },
        orderBy: { openedAt: "asc" },
        take: 12,
        select: {
          id: true,
          symbol: true,
          direction: true,
          quantity: true,
          openedAt: true,
          initialRisk: true,
          plannedStop: true,
          account: { select: { name: true, currency: true } },
        },
      }),
      // B-05 — CONTEGGIO delle posizioni aperte da una count dedicata: la
      // lista sopra è troncata a 12 e non può fare da numero.
      prisma.trade.count({ where: { ...accountWhere, status: "OPEN" } }),
      prisma.trade.findMany({
        where: recentWhere,
        orderBy: { openedAt: "desc" },
        take: 6,
        select: {
          id: true,
          symbol: true,
          direction: true,
          status: true,
          netPnl: true,
          rMultiple: true,
          openedAt: true,
          account: { select: { currency: true } },
        },
      }),
      // Fase 27 — P&L per mese di TUTTO lo storico (fuso utente): il
      // calendario mensile ha la sua navigazione per anno e, come saldo e
      // mini-calendario, non segue il filtro periodo della dashboard.
      getPeriodPnl(
        // B-02 — valuta lifetime: il calendario mensile è un widget storico.
        { userId, accountId: activeAccountId, currency: lifetimeScope.active },
        user.timezone,
        "month",
      ),
    ]);

  // Metriche (tutte Decimal-safe, sul server; il client formatta soltanto)
  const dayWins = daily.filter((d) => new Decimal(d.netPnl).gt(0)).length;
  const dayWinRate = winRate(dayWins, daily.length);
  // Q-01 — base della curva di equity del periodo (senza `from` il
  // correttivo è zero e la base coincide col saldo iniziale).
  const equityStart = new Decimal(baseBalance)
    .plus(pnlBeforePeriod)
    .toFixed(2);
  // LA serie giornaliera del periodo (daily-series.ts): sedute feriali, le
  // giornate senza trade a P&L 0. Tutte le metriche per-giornata della
  // dashboard passano di qui — prima ognuna rimasticava i bucket grezzi di
  // getDailyPnl, che contengono i soli giorni con trade, e lo stesso Sortino
  // valeva una cosa qui e un'altra su /analytics.
  // Attenzione: parte dal primo giorno CON TRADE del periodo filtrato, non
  // dall'inizio del periodo. `dailySeries.length` è il numero di osservazioni
  // vero, ed è quello che va mostrato.
  const dailySeries = dailyReturns(daily, equityStart);
  // Gemella in R: stessi giorni, P&L sostituito dall'R della giornata. La
  // base è "0" perché in R non esiste un'equity — `ret` resta null e infatti
  // qui serve solo il drawdown, che legge netPnl.
  const dailySeriesR = dailyReturns(
    daily.map((d) => ({ day: d.day, netPnl: d.rSum })),
    "0",
  );

  // I rapporti sui RITORNI si calcolano sul tratto finale con tutti i ritorni
  // definiti: un conto passato per equity ≤ 0 e poi ripreso non deve perdere
  // Sortino e Sharpe per sempre. Il drawdown e l'ulcer restano sull'intera
  // serie — leggono il P&L, che è sempre definito.
  const ratioWindow = validReturnWindow(dailySeries);

  const dd = maxDrawdown(dailySeries, equityStart);
  const ddR = maxDrawdown(dailySeriesR, "0");
  const aWin = avgWin(agg.winSum, agg.wins);
  const aLoss = avgLoss(agg.lossSum, agg.losses);

  const rTotal = new Decimal(agg.rSum);
  // L'Ulcer alimenta sia la card sia il fattore drawdown dello Score: una
  // sola chiamata, mai due convenzioni per la stessa buca.
  const ulcer = ulcerIndex(dailySeries, equityStart);
  const score = radarScore({
    total: agg.total,
    wins: agg.wins,
    losses: agg.losses,
    winSum: agg.winSum,
    lossSum: agg.lossSum,
    // Ogni fattore è un tasso o una media: mai il max drawdown (un massimo,
    // che cresce con la finestra) né il P&L netto (un totale).
    ulcer,
    grossLosses: agg.grossLosses,
    plannedRiskLosses: agg.plannedRiskLosses,
    riskRespectedLosses: agg.riskRespectedLosses,
    daily,
  });
  const expectancyR =
    agg.rCount === 0 ? null : rTotal.div(agg.rCount).toFixed(4);
  const avgWinR =
    agg.rWins === 0 ? null : new Decimal(agg.rWinSum).div(agg.rWins).toFixed(4);
  const avgLossR =
    agg.rLosses === 0
      ? null
      : new Decimal(agg.rLossSum).abs().div(agg.rLosses).toFixed(4);

  const layout = parseDashboardLayout(user.dashboardLayout);
  const data: DashboardData = {
    currency,
    // B-02 — valuta dei widget lifetime, risolta su tutto lo storico.
    lifetimeCurrency,
    // F6 — totali per valuta presenti nel periodo (per i totali affiancati) e
    // flag multi-valuta (mostra selettore + nota). Mai una somma cross-valuta.
    currencyTotals,
    multiCurrency: scope.multi,
    baseBalance,
    lifetimeBaseBalance,
    // Saldo REALE del conto: iniziale + P&L di tutto lo storico chiuso,
    // mai filtrato dal periodo (il P&L di periodo è un widget a parte).
    // B-02 — entrambi i termini nella valuta LIFETIME, mai in quella del
    // periodo: il saldo non cambia perimetro cambiando periodo.
    accountBalance: new Decimal(lifetimeBaseBalance)
      .plus(lifetimeNetPnl)
      .toFixed(2),
    lifetimeNetPnl,
    period: {
      key: period.key,
      label: period.label,
      fromKey: period.fromKey,
      toKey: period.toKey,
    },
    totalTrades: agg.total,
    // F15 — hero di onboarding finché l'utente non ha inserito alcun trade.
    neverTraded: lifetimeTradeCount === 0,
    wins: agg.wins,
    losses: agg.losses,
    breakevens: agg.breakevens,
    // B-05 — numero VERO di posizioni aperte (count SQL), non la lista ≤12.
    openTrades: openTradeCount,
    // F33 — dettaglio posizioni aperte: durata "finora" calcolata sul server
    // (display only, il Number è tempo, non denaro).
    openPositions: openTradeRows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      quantity: t.quantity.toString(),
      openedAtLabel: formatDateTime(t.openedAt, user.timezone),
      openForSec: secondsSince(t.openedAt),
      initialRisk: t.initialRisk?.toString() ?? null,
      plannedStop: t.plannedStop?.toString() ?? null,
      currency: t.account.currency,
      accountName: t.account.name,
    })),
    netPnl: agg.netPnl,
    fees: agg.fees,
    netR: rTotal.toFixed(2),
    rCount: agg.rCount,
    // Denaro fuori dall'istogramma R: il conteggio dei trade non basta.
    netPnlWithoutR: agg.netPnlWithoutR,
    winRate: winRate(agg.wins, agg.total),
    dayWinRate,
    dayWins,
    dayCount: daily.length,
    daysCovered: coveredDays(daily),
    // Finestra EFFETTIVA dei ratio: sedute feriali dal primo giorno con trade
    // all'ultimo (non la durata del periodo), meno l'eventuale tratto
    // iniziale con equity ≤ 0.
    ratioWindow: {
      observations: ratioWindow.window.length,
      skipped: ratioWindow.skipped,
      undefinedDays: ratioWindow.undefinedDays,
    },
    profitFactor: profitFactor(agg.winSum, agg.lossSum),
    expectancy: expectancy(agg),
    expectancyR,
    avgWin: aWin,
    avgLoss: aLoss,
    payoff: payoffRatio(aWin, aLoss),
    avgWinR,
    avgLossR,
    dd,
    ddR,
    // Analytics: sequenza trade (ultimi ≤200), streak max/medie, statistiche
    // per giornata e sessioni — tutto da serie già ridotte o aggregati SQL.
    sequence: sequence.map((p) => ({
      label: formatDateTime(p.closedAt, user.timezone),
      symbol: p.symbol,
      netPnl: p.netPnl,
      rMultiple: p.rMultiple,
    })),
    sequenceTruncated: agg.total > sequence.length,
    tradeRuns: streakSummary(sequence.map((p) => classifyOutcome(p.netPnl))),
    dayRuns: dayStreakSummary(daily),
    dayRunsR: dayStreakSummary(daily.map((d) => ({ ...d, netPnl: d.rSum }))),
    days: dayStats(daily),
    daysR: dayStats(daily.map((d) => ({ ...d, netPnl: d.rSum }))),
    bestWin: agg.bestWin,
    worstLoss: agg.worstLoss,
    bestWinR: agg.bestWinR,
    worstLossR: agg.worstLossR,
    avgWinDurationSec: agg.avgWinDurationSec,
    avgLossDurationSec: agg.avgLossDurationSec,
    sessions: fillSessionSeries(sessionRows),
    weekdays: fillWeekdaySeries(weekdayRows),
    // Metriche avanzate (FASE 9): ratio adimensionali sulla stessa serie
    // giornaliera del drawdown e sugli aggregati R già in SQL.
    sortino: sortinoRatio(ratioWindow.window),
    sharpe: sharpeRatio(ratioWindow.window),
    calmar: calmarRatio(daily, equityStart, dd.maxDrawdownPct),
    sqn: sqn(agg.rCount, agg.rSum, agg.rSumSq),
    ulcer,
    tradeStreak: currentStreak(outcomes),
    dayStreak: currentDayStreak([...daily].reverse()),
    // Score a 6 fattori per il radar (peso uguale 100/6, v. lib/metrics/score.ts).
    score,
    // F32 — istogramma R (bin 0,5R + colonna BE) da aggregato SQL completo.
    rDistribution: fillRDistribution(rDistributionRows, BE_BIN),
    // W4 — underwater sulla stessa serie del cumulativo.
    underwater: underwaterSeries(dailySeries, equityStart),
    daily: daily.map((d) => ({ day: d.day, netPnl: d.netPnl, rSum: d.rSum })),
    recent: recentTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      netPnl: t.netPnl.toString(),
      rMultiple: t.rMultiple?.toString() ?? null,
      currency: t.account.currency,
      openedAtLabel: formatDateTime(t.openedAt, user.timezone),
    })),
    hidden: layout.hidden,
    // F26 — stato persistito dei toggle mobile (chiave separata dal desktop).
    mobileLayout: layout.mobile,
    // F26 — mini-calendario del mese corrente (mai filtrato dal periodo).
    miniCalendar: {
      month: currentMonth,
      todayKey,
      days: monthDaily.map((d) => ({
        day: d.day,
        netPnl: d.netPnl,
        trades: d.trades,
      })),
    },
    // Fase 27 — griglie annuali del calendario mensile (convenzione del
    // rolling: ritorno = P&L del mese / equity a inizio mese).
    // B-02 — base dell'equity che scorre nella valuta lifetime, coerente
    // con le righe mensili qui sopra.
    monthlyGrids: monthlyReturnGrids(monthlyRows, lifetimeBaseBalance),
  };

  return <DashboardView data={data} />;
}
