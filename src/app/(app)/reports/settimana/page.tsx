import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId } from "@/lib/active-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { addDays, isValidDateKey } from "@/lib/calendar";
import { formatDayKey, todayKeyInZone, zonedInputToUtc } from "@/lib/dates";
import { mondayOf } from "@/lib/period";
import {
  expectancy,
  netPnlInfo,
  profitFactor,
  profitFactorInfo,
  winRate,
  winRateInfo,
} from "@/lib/metrics";
import {
  getStreakStats,
  getTagBreakdown,
} from "@/lib/queries/reports";
import {
  getCurrencyBreakdown,
  getDailyPnl,
  getTradeAggregates,
  type StatsFilter,
} from "@/lib/queries/stats";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import {
  formatPercent,
  formatRMultiple,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { MetricInfo } from "@/components/metric-info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Report settimanale" };

/**
 * W3 — «Report del venerdì»: digest della settimana generato dalle STESSE
 * formule testate del resto dell'app (zero AI, zero allucinazioni, tutto
 * verificabile), impaginato per la stampa/PDF nativi del browser.
 */

function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const fmt = (key: string) =>
    new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(`${key}T12:00:00Z`));
  return `${fmt(monday)} – ${fmt(sunday)} ${sunday.slice(0, 4)}`;
}

/** Delta leggibile fra due importi (stringhe decimali). */
function deltaLabel(current: string, previous: string): string {
  const delta = new Decimal(current).minus(previous);
  return `${delta.gte(0) ? "+" : ""}${delta.toFixed(2)}`;
}

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; cur?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [user, activeAccountId, params] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, baseCurrency: true },
    }),
    getActiveAccountId(),
    searchParams,
  ]);

  // Settimana richiesta (?w=lunedì) o quella corrente nel fuso utente.
  const todayKey = todayKeyInZone(user.timezone);
  const monday =
    params.w && isValidDateKey(params.w) ? mondayOf(params.w) : mondayOf(todayKey);
  const prevMonday = addDays(monday, -7);

  const bounds = (fromKey: string): { from: Date; to: Date } => ({
    from: zonedInputToUtc(`${fromKey}T00:00`, user.timezone),
    to: zonedInputToUtc(`${addDays(fromKey, 7)}T00:00`, user.timezone),
  });

  const baseFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    ...bounds(monday),
  };

  // F6 — stesso scope valuta dei Reports: mai sommare valute diverse.
  const currencyTotals = await getCurrencyBreakdown(baseFilter);
  const scope = resolveCurrencyScope(currencyTotals, params.cur);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const prevFilter: StatsFilter = { ...filter, ...bounds(prevMonday) };
  const currency =
    scope.active ??
    (activeAccountId !== ALL_ACCOUNTS
      ? (
          await prisma.tradingAccount.findFirst({
            where: { id: activeAccountId, userId },
            select: { currency: true },
          })
        )?.currency
      : undefined) ??
    user.baseCurrency;

  const [agg, prevAgg, daily, tags, streaks] = await Promise.all([
    getTradeAggregates(filter),
    getTradeAggregates(prevFilter),
    getDailyPnl(filter, user.timezone),
    getTagBreakdown(filter),
    getStreakStats(filter),
  ]);

  const rate = winRate(agg.wins, agg.total);
  const prevRate = winRate(prevAgg.wins, prevAgg.total);
  const pf = profitFactor(agg.winSum, agg.lossSum);
  const exp = expectancy(agg);

  // Giornata migliore/peggiore della settimana.
  let bestDay: { day: string; netPnl: string } | null = null;
  let worstDay: { day: string; netPnl: string } | null = null;
  for (const d of daily) {
    if (!bestDay || new Decimal(d.netPnl).gt(bestDay.netPnl)) bestDay = d;
    if (!worstDay || new Decimal(d.netPnl).lt(worstDay.netPnl)) worstDay = d;
  }

  // Errori taggati (categoria MISTAKE) e loro costo in R e valuta.
  const mistakes = tags.filter((t) => t.category === "MISTAKE");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Torna ai Reports">
            <Link href="/reports">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="page-title">Report settimanale</h1>
            <p className="page-subtitle">
              La review del venerdì, generata dai tuoi numeri
              {scope.multi ? ` · ${currency}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Settimana precedente">
            <Link href={`/reports/settimana?w=${prevMonday}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Settimana successiva">
            <Link href={`/reports/settimana?w=${addDays(monday, 7)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
            <span>Settimana {weekLabel(monday)}</span>
            <span className="text-xs font-normal text-muted-foreground">
              L&B TradeJournal
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {agg.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun trade chiuso in questa settimana.
            </p>
          ) : (
            <>
              {/* Numeri chiave con confronto settimana precedente */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="stat-label flex items-center gap-1">
                    Net P&L
                    <MetricInfo info={netPnlInfo} />
                  </p>
                  <p className={cn("stat-value", pnlColorClass(agg.netPnl))}>
                    {formatSignedMoney(agg.netPnl, currency)}
                  </p>
                  <p className="stat-sub mt-0.5">
                    {prevAgg.total > 0
                      ? `${deltaLabel(agg.netPnl, prevAgg.netPnl)} ${currency} vs settimana precedente`
                      : "settimana precedente senza trade"}
                  </p>
                </div>
                <div>
                  <p className="stat-label flex items-center gap-1">
                    Win Rate
                    <MetricInfo info={winRateInfo} />
                  </p>
                  <p className="stat-value">{formatPercent(rate)}</p>
                  <p className="stat-sub mt-0.5">
                    {agg.total} trade ({agg.wins}W/{agg.losses}L
                    {agg.breakevens > 0 ? `/${agg.breakevens}BE` : ""})
                    {prevRate !== null ? ` · prec. ${formatPercent(prevRate)}` : ""}
                  </p>
                </div>
                <div>
                  <p className="stat-label flex items-center gap-1">
                    Profit Factor
                    <MetricInfo info={profitFactorInfo} />
                  </p>
                  <p className="stat-value">
                    {pf !== null
                      ? formatRMultiple(pf).slice(0, -1)
                      : agg.wins > 0
                        ? "∞"
                        : "—"}
                  </p>
                  <p className="stat-sub mt-0.5">
                    Attesa/trade{" "}
                    {exp !== null ? formatSignedMoney(exp, currency) : "—"}
                  </p>
                </div>
              </div>

              {/* Estremi della settimana */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-profit/40 p-3">
                  <p className="text-sm font-semibold text-profit">Il meglio</p>
                  <p className="mt-1 text-sm">
                    Miglior trade{" "}
                    <span className="font-medium tabular-nums text-profit">
                      {agg.bestWin !== null
                        ? formatSignedMoney(agg.bestWin, currency)
                        : "—"}
                    </span>
                    {bestDay ? (
                      <>
                        {" · "}miglior giornata {formatDayKey(bestDay.day)}{" "}
                        <span className={cn("font-medium tabular-nums", pnlColorClass(bestDay.netPnl))}>
                          {formatSignedMoney(bestDay.netPnl, currency)}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Serie di win più lunga: {streaks.maxWinStreak}
                  </p>
                </div>
                <div className="rounded-lg border border-loss/40 p-3">
                  <p className="text-sm font-semibold text-loss">Il peggio</p>
                  <p className="mt-1 text-sm">
                    Peggior trade{" "}
                    <span className="font-medium tabular-nums text-loss">
                      {agg.worstLoss !== null
                        ? formatSignedMoney(agg.worstLoss, currency)
                        : "—"}
                    </span>
                    {worstDay ? (
                      <>
                        {" · "}peggior giornata {formatDayKey(worstDay.day)}{" "}
                        <span className={cn("font-medium tabular-nums", pnlColorClass(worstDay.netPnl))}>
                          {formatSignedMoney(worstDay.netPnl, currency)}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Serie di loss più lunga: {streaks.maxLossStreak}
                  </p>
                </div>
              </div>

              {/* Errori taggati e loro costo */}
              <div>
                <p className="stat-label mb-2">Errori taggati della settimana</p>
                {mistakes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun tag errore sui trade della settimana: o disciplina
                    perfetta, o journaling da completare.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {mistakes.map((tag) => (
                      <li
                        key={tag.tagId}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant="secondary">{tag.name}</Badge>
                          <span className="text-muted-foreground">
                            {tag.total} trade
                          </span>
                        </span>
                        <span className="tabular-nums">
                          <span className={pnlColorClass(tag.netPnl)}>
                            {formatSignedMoney(tag.netPnl, currency)}
                          </span>
                          {tag.rCount > 0 ? (
                            <span className="ml-2 text-muted-foreground">
                              {formatRMultiple(tag.rSum)} totali
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Generato dalle stesse formule testate dell&apos;app (niente
                stime, niente AI): ogni numero è riconciliabile coi Reports.
                {scope.multi
                  ? " Scope valuta: " + currency + " (mai somme cross-valuta)."
                  : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
