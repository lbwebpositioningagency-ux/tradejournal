import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { BarChart3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId } from "@/lib/active-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import {
  currentStreak,
  expectancy,
  expectancyInfo,
  netPnlInfo,
  profitFactor,
  profitFactorInfo,
  streaksInfo,
  winRate,
  winRateInfo,
} from "@/lib/metrics";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import {
  formatPercent,
  formatRMultiple,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import {
  bestAndWorstBucket,
  fillHourSeries,
  fillWeekdaySeries,
  type BucketPoint,
} from "@/lib/reports";
import {
  getHourBreakdown,
  getStrategyBreakdown,
  getStreakStats,
  getTagBreakdown,
  getWeekdayBreakdown,
  type BreakdownAggregates,
} from "@/lib/queries/reports";
import {
  getCurrencyBreakdown,
  getRecentTradeOutcomes,
  type StatsFilter,
} from "@/lib/queries/stats";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { cn } from "@/lib/utils";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Reports" };

/**
 * Testo per <MetricInfo> dell'R medio: tenuto accanto a rowMetrics, che è
 * il punto in cui il numero viene calcolato (regola di FASE 10).
 */
const avgRInfo = {
  label: "R medio",
  description:
    "Media degli R-multiple dei trade con rischio definito: quante volte il rischio iniziale hai incassato in media per trade, indipendente dalla size.",
  formula: "R medio = Σ R-multiple / n° trade con rischio · R = netPnl / rischio iniziale",
};

/** Metriche di riga derivate dagli aggregati SQL (tutte Decimal-safe). */
function rowMetrics(row: BreakdownAggregates) {
  const pf = profitFactor(row.winSum, row.lossSum);
  return {
    winRate: formatPercent(winRate(row.wins, row.total)),
    profitFactor:
      pf !== null
        ? formatRMultiple(pf).slice(0, -1)
        : row.wins > 0
          ? "∞"
          : "—",
    expectancy: expectancy(row),
    avgR:
      row.rCount > 0
        ? formatRMultiple(new Decimal(row.rSum).div(row.rCount).toFixed(4))
        : "—",
  };
}

function BreakdownTable({
  rows,
  currency,
}: {
  rows: {
    key: string;
    label: React.ReactNode;
    aggregates: BreakdownAggregates;
  }[];
  currency: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="text-right">Trade</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Win % <MetricInfo info={winRateInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                PF <MetricInfo info={profitFactorInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Attesa/trade <MetricInfo info={expectancyInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                R medio <MetricInfo info={avgRInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Net P&L <MetricInfo info={netPnlInfo} />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const m = rowMetrics(row.aggregates);
            return (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.aggregates.total}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({row.aggregates.wins}W/{row.aggregates.losses}L
                    {row.aggregates.breakevens > 0
                      ? `/${row.aggregates.breakevens}BE`
                      : ""}
                    )
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{m.winRate}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.profitFactor}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    m.expectancy !== null ? pnlColorClass(m.expectancy) : undefined,
                  )}
                >
                  {m.expectancy !== null
                    ? formatSignedMoney(m.expectancy, currency)
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{m.avgR}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    pnlColorClass(row.aggregates.netPnl),
                  )}
                >
                  {formatSignedMoney(row.aggregates.netPnl, currency)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function BestWorstLine({
  points,
  currency,
  unit,
}: {
  points: BucketPoint[];
  currency: string;
  unit: string;
}) {
  const extremes = bestAndWorstBucket(points);
  if (!extremes) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {`${unit} migliore `}
      <span className={cn("font-medium", pnlColorClass(extremes.best.netPnl))}>
        {extremes.best.label} ({formatSignedMoney(extremes.best.netPnl, currency)})
      </span>
      {" · peggiore "}
      <span className={cn("font-medium", pnlColorClass(extremes.worst.netPnl))}>
        {extremes.worst.label} ({formatSignedMoney(extremes.worst.netPnl, currency)})
      </span>
    </p>
  );
}

const TAG_CATEGORY_LABELS: Record<string, string> = {
  SETUP: "setup",
  MISTAKE: "errore",
  EMOTION: "emozione",
  CUSTOM: "custom",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const period = resolvePeriod(params, user.timezone);
  const baseFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    from: period.from,
    to: period.to,
  };
  const curParam = typeof params.cur === "string" ? params.cur : undefined;

  // F6 — scope per valuta (mai sommare valute diverse): prima le valute
  // presenti, poi tutti i report ristretti alla valuta attiva.
  const [currencyTotals, activeAccount] = await Promise.all([
    getCurrencyBreakdown(baseFilter),
    activeAccountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({
          where: { id: activeAccountId, userId },
          select: { currency: true },
        }),
  ]);
  const scope = resolveCurrencyScope(currencyTotals, curParam);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

  const [strategies, tags, hours, weekdays, streaks, outcomes] =
    await Promise.all([
      getStrategyBreakdown(filter),
      getTagBreakdown(filter),
      getHourBreakdown(filter, user.timezone),
      getWeekdayBreakdown(filter, user.timezone),
      getStreakStats(filter),
      getRecentTradeOutcomes(filter),
    ]);
  const totalTrades = strategies.reduce((acc, s) => acc + s.total, 0);
  const hourSeries = fillHourSeries(hours);
  const weekdaySeries = fillWeekdaySeries(weekdays);
  const current = currentStreak(outcomes);
  const suffix = ` ${currency}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">
            {totalTrades} trade chiusi · {period.label}
            {scope.multi
              ? ` · ${currency}`
              : activeAccountId === ALL_ACCOUNTS
                ? " · tutti i conti"
                : ""}
          </p>
          {scope.multi ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Totali per valuta (mai sommati):{" "}
              {currencyTotals.map((t, i) => (
                <span key={t.currency}>
                  {i > 0 ? " · " : ""}
                  <span className={pnlColorClass(t.netPnl)}>
                    {formatSignedMoney(t.netPnl, t.currency)}
                  </span>
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scope.multi ? (
            <CurrencyFilter
              currencies={currencyTotals.map((t) => t.currency)}
              active={currency}
            />
          ) : null}
          <PeriodFilter
            periodKey={period.key}
            fromKey={period.fromKey}
            toKey={period.toKey}
            label={period.label}
          />
        </div>
      </div>

      {totalTrades === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nessun trade chiuso nel periodo"
          description="I report si popolano con i trade chiusi: allarga il periodo o cambia conto attivo."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="stat-label">
                Per strategia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BreakdownTable
                currency={currency}
                rows={strategies.map((s) => ({
                  key: s.strategyId ?? "__none__",
                  label: (
                    <span className="flex items-center gap-2">
                      {s.color ? (
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                      ) : null}
                      {s.name}
                    </span>
                  ),
                  aggregates: s,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="stat-label">
                Per tag
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun tag sui trade del periodo.
                </p>
              ) : (
                <>
                  <BreakdownTable
                    currency={currency}
                    rows={tags.map((t) => ({
                      key: t.tagId,
                      label: (
                        <span className="flex items-baseline gap-2">
                          {t.name}
                          <span className="text-xs text-muted-foreground">
                            {TAG_CATEGORY_LABELS[t.category] ?? t.category}
                          </span>
                        </span>
                      ),
                      aggregates: t,
                    }))}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Un trade può avere più tag: le righe si sovrappongono e le
                    somme non coincidono col totale del conto.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="stat-label">
                  Per ora di apertura (fuso {user.timezone})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReportBarChart points={hourSeries} suffix={suffix} />
                <BestWorstLine points={hourSeries} currency={currency} unit="Ora" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="stat-label">
                  Per giorno della settimana (apertura)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReportBarChart points={weekdaySeries} suffix={suffix} />
                <BestWorstLine
                  points={weekdaySeries}
                  currency={currency}
                  unit="Giorno"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="stat-label flex items-center gap-1">
                Streak
                <MetricInfo info={streaksInfo} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Serie di win più lunga
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-profit">
                    {streaks.maxWinStreak}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Serie di loss più lunga
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-loss">
                    {streaks.maxLossStreak}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Streak corrente</p>
                  <p
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      current.direction === "WIN"
                        ? "text-profit"
                        : current.direction === "LOSS"
                          ? "text-loss"
                          : "text-breakeven",
                    )}
                  >
                    {current.direction === "NONE"
                      ? "—"
                      : `${current.length} ${current.direction === "WIN" ? "win" : "loss"}`}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Trade consecutivi nel periodo, in ordine di chiusura; un
                breakeven interrompe la serie. La streak corrente parte dal
                trade più recente.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
