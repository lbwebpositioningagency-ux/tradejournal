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
import {
  avgLoss,
  avgWin,
  calmarRatio,
  coveredDays,
  classifyOutcome,
  compositeScoreParts,
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
} from "@/lib/metrics";
import {
  BE_BIN,
  getCurrencyBreakdown,
  getDailyPnl,
  getLifetimeNetPnl,
  getRDistribution,
  getRecentTradeOutcomes,
  getStartingBalance,
  getTradeAggregates,
  getTradeSequence,
  type StatsFilter,
} from "@/lib/queries/stats";
import { fillRDistribution } from "@/lib/reports";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { getSessionBreakdown } from "@/lib/queries/reports";
import { fillSessionSeries } from "@/lib/sessions";
import { parseDashboardLayout } from "@/lib/dashboard";
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

  const period = resolvePeriod(params, user.timezone);

  const baseFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    from: period.from,
    to: period.to,
  };

  // F6 — prima si determinano le valute presenti nel periodo/scope e la valuta
  // attiva (mai sommare valute diverse), poi tutte le metriche girano ristrette
  // a quella valuta.
  const [currencyTotals, activeAccount] = await Promise.all([
    getCurrencyBreakdown(baseFilter),
    activeAccountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({
          where: { id: activeAccountId, userId },
          select: { currency: true },
        }),
  ]);
  const scope = resolveCurrencyScope(currencyTotals, params.cur);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

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
  // filtro periodo come il Saldo conto; stesso scope conto/valuta.
  const todayKey = todayKeyInZone(user.timezone);
  const currentMonth = todayKey.slice(0, 7);
  const monthFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    currency: scope.active,
    from: zonedInputToUtc(`${currentMonth}-01T00:00`, user.timezone),
    to: zonedInputToUtc(`${addMonths(currentMonth, 1)}-01T00:00`, user.timezone),
  };

  const [
    agg,
    daily,
    monthDaily,
    outcomes,
    baseBalance,
    lifetimeNetPnl,
    sequence,
    sessionRows,
    rDistributionRows,
    openTradeRows,
    recentTrades,
    lifetimeTradeCount,
  ] = await Promise.all([
      getTradeAggregates(filter),
      getDailyPnl(filter, user.timezone),
      getDailyPnl(monthFilter, user.timezone),
      getRecentTradeOutcomes(filter),
      getStartingBalance(filter),
      getLifetimeNetPnl(filter),
      getTradeSequence(filter),
      getSessionBreakdown(filter),
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
      // F15 — onboarding: l'utente ha mai inserito un trade (qualsiasi conto/stato)?
      prisma.trade.count({ where: { account: { userId } } }),
    ]);

  // Metriche (tutte Decimal-safe, sul server; il client formatta soltanto)
  const dayWins = daily.filter((d) => new Decimal(d.netPnl).gt(0)).length;
  const dayWinRate = winRate(dayWins, daily.length);
  const dd = maxDrawdown(daily, baseBalance);
  const ddR = maxDrawdown(
    daily.map((d) => ({ ...d, netPnl: d.rSum })),
    "0",
  );
  const aWin = avgWin(agg.winSum, agg.wins);
  const aLoss = avgLoss(agg.lossSum, agg.losses);

  const rTotal = new Decimal(agg.rSum);
  const scoreParts = compositeScoreParts({
    total: agg.total,
    wins: agg.wins,
    losses: agg.losses,
    winSum: agg.winSum,
    lossSum: agg.lossSum,
    maxDrawdownPct: dd.maxDrawdownPct,
    dayWinRate,
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
    // F6 — totali per valuta presenti nel periodo (per i totali affiancati) e
    // flag multi-valuta (mostra selettore + nota). Mai una somma cross-valuta.
    currencyTotals,
    multiCurrency: scope.multi,
    baseBalance,
    // Saldo REALE del conto: iniziale + P&L di tutto lo storico chiuso,
    // mai filtrato dal periodo (il P&L di periodo è un widget a parte).
    accountBalance: new Decimal(baseBalance).plus(lifetimeNetPnl).toFixed(2),
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
    openTrades: openTradeRows.length,
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
    winRate: winRate(agg.wins, agg.total),
    dayWinRate,
    dayWins,
    dayCount: daily.length,
    daysCovered: coveredDays(daily),
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
    // Metriche avanzate (FASE 9): ratio adimensionali sulla stessa serie
    // giornaliera del drawdown e sugli aggregati R già in SQL.
    sortino: sortinoRatio(daily),
    sharpe: sharpeRatio(daily),
    calmar: calmarRatio(daily, baseBalance, dd.maxDrawdownPct),
    sqn: sqn(agg.rCount, agg.rSum, agg.rSumSq),
    ulcer: ulcerIndex(daily, baseBalance),
    tradeStreak: currentStreak(outcomes),
    dayStreak: currentDayStreak([...daily].reverse()),
    score: scoreParts?.score ?? null,
    // F35 — le tre componenti dello Score, mostrate come barre con valore.
    scoreParts: scoreParts
      ? {
          profitability: scoreParts.profitability,
          risk: scoreParts.risk,
          consistency: scoreParts.consistency,
        }
      : null,
    // F32 — istogramma R (bin 0,5R + colonna BE) da aggregato SQL completo.
    rDistribution: fillRDistribution(rDistributionRows, BE_BIN),
    // W4 — underwater sulla stessa serie del cumulativo.
    underwater: underwaterSeries(daily, baseBalance),
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
  };

  return <DashboardView data={data} />;
}
