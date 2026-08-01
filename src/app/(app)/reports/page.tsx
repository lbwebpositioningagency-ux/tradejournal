import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import {
  avgR,
  avgRInfo,
  avgWinLossR,
  avgWinLossRInfo,
  currentStreak,
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
  formatProfitFactor,
  formatRMultiple,
  formatRatio,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { periodCookieFallback } from "@/lib/period-cookie";
import {
  bestAndWorstBucket,
  fillHourSeries,
  fillWeekdaySeries,
  type BucketPoint,
} from "@/lib/reports";
import {
  getBiasAlignmentBreakdown,
  getDirectionAssetBreakdown,
  getHourBreakdown,
  getMonthBreakdown,
  getStrategyBreakdown,
  getStreakStats,
  getSymbolBreakdown,
  getTagBreakdown,
  getWeekdayBreakdown,
  type BreakdownAggregates,
} from "@/lib/queries/reports";
import { daysInMonth } from "@/lib/dates";
import { NO_STRATEGY_FILTER } from "@/lib/trade-filters";
import {
  getCurrencyBreakdown,
  getRecentTradeOutcomes,
  type StatsFilter,
} from "@/lib/queries/stats";
import { resolveCurrencyScope } from "@/lib/currency-scope";
// TODO(P-04): import TEMPORANEO della misura stadi — rimuovere dopo la misura.
import { createStageTimer } from "@/lib/stage-timing";
import { cn } from "@/lib/utils";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Button } from "@/components/ui/button";
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
 * Metriche di riga derivate dagli aggregati SQL (tutte Decimal-safe).
 *
 * Fase 60 — set di colonne standard delle tabelle di breakdown:
 * Trade · Win % · Avg Win/Loss · PF · Expectancy · Net P&L. L'"Attesa/trade"
 * in valuta è stata rimossa: diceva la stessa cosa dell'Expectancy con
 * un'unità che non regge il confronto fra conti in valute diverse.
 * Nessuna formula vive qui: winRate/avgWinLossR/profitFactor/avgR stanno in
 * src/lib/metrics e sono le stesse di ogni altra tabella.
 */
function rowMetrics(row: BreakdownAggregates) {
  return {
    winRate: formatPercent(winRate(row.wins, row.total)),
    avgWinLoss: formatRatio(avgWinLossR(row)),
    profitFactor: formatProfitFactor(
      profitFactor(row.winSum, row.lossSum),
      row.wins,
    ),
    expectancyR: (() => {
      const value = avgR(row.rSum, row.rCount);
      return value !== null ? formatRMultiple(value) : "—";
    })(),
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
    /** F31 — drill-down: la riga apre la Trade View già filtrata. */
    href?: string;
  }[];
  currency: string;
}) {
  return (
    <>
      {/* F27 — mobile (< md): card impilate col Net P&L SEMPRE in vista,
          stesso trattamento della Trade View: niente colonne nascoste oltre
          il bordo destro senza indizi. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const m = rowMetrics(row.aggregates);
          const body = (
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium tabular-nums",
                    pnlColorClass(row.aggregates.netPnl),
                  )}
                >
                  {formatSignedMoney(row.aggregates.netPnl, currency)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                <span>
                  {row.aggregates.total} trade ({row.aggregates.wins}W/
                  {row.aggregates.losses}L
                  {row.aggregates.breakevens > 0
                    ? `/${row.aggregates.breakevens}BE`
                    : ""}
                  )
                </span>
                <span>Win {m.winRate}</span>
                <span>Avg W/L {m.avgWinLoss}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                <span>PF {m.profitFactor}</span>
                <span>Expectancy {m.expectancyR}</span>
              </span>
            </>
          );
          const itemClass =
            "flex flex-col gap-1 rounded-lg border bg-card p-3";
          return (
            <li key={row.key}>
              {row.href ? (
                <Link
                  href={row.href}
                  className={cn(itemClass, "transition-colors hover:bg-accent/50")}
                >
                  {body}
                </Link>
              ) : (
                <div className={itemClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Desktop (≥ md): tabella completa, invariata */}
      <div className="hidden overflow-x-auto md:block">
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
                Avg Win/Loss <MetricInfo info={avgWinLossRInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                PF <MetricInfo info={profitFactorInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Expectancy <MetricInfo info={avgRInfo} />
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
              <TableRow
                key={row.key}
                className={row.href ? "relative" : undefined}
              >
                <TableCell className="font-medium">
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="absolute inset-0"
                      aria-label="Apri i trade di questa riga"
                    />
                  ) : null}
                  {row.label}
                </TableCell>
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
                  {m.avgWinLoss}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.profitFactor}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.expectancyR}
                </TableCell>
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
    </>
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
  // TODO(P-04): misura TEMPORANEA degli stadi (vedi lib/stage-timing.ts) —
  // rimuovere timer e mark dopo la lettura dei numeri in produzione.
  // Qui non c'è nulla da fondere senza cambiare query: ogni report dello
  // stadio finale dipende dalla valuta attiva, che dipende dal breakdown.
  const timing = createStageTimer("/reports");
  const session = await auth();
  timing.mark("auth");
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
  timing.mark("scope");
  // Scope dei dati: utente di sistema quando il conto attivo è il demo SIM1.
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
  timing.mark("currency");
  const scope = resolveCurrencyScope(currencyTotals, curParam);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

  const [strategies, tags, symbols, directionAssets, months, hours, weekdays, streaks, outcomes, biasRows] =
    await Promise.all([
      getStrategyBreakdown(filter),
      getTagBreakdown(filter),
      getSymbolBreakdown(filter),
      getDirectionAssetBreakdown(filter),
      getMonthBreakdown(filter, user.timezone),
      getHourBreakdown(filter, user.timezone),
      getWeekdayBreakdown(filter, user.timezone),
      getStreakStats(filter),
      getRecentTradeOutcomes(filter),
      getBiasAlignmentBreakdown(filter, user.timezone),
    ]);
  timing.mark("queries");
  timing.flush();
  // W2 — bias × esecuzione: righe classificate e non.
  const biasAligned = biasRows.find((r) => r.alignment === "ALIGNED");
  const biasAgainst = biasRows.find((r) => r.alignment === "AGAINST");
  const biasUnrated = biasRows.find((r) => r.alignment === "UNRATED");
  const biasRated = (biasAligned?.total ?? 0) + (biasAgainst?.total ?? 0);
  const totalTrades = strategies.reduce((acc, s) => acc + s.total, 0);
  const hourSeries = fillHourSeries(hours);
  const weekdaySeries = fillWeekdaySeries(weekdays);
  const current = currentStreak(outcomes);
  const suffix = ` ${currency}`;

  // F31 — drill-down: link alla Trade View coi filtri della riga, preservando
  // il periodo attivo. Nota: la Trade View filtra il periodo su openedAt
  // (elenco per apertura), i report aggregano su closedAt — un trade overnight
  // a cavallo del confine può differire (divergenza nota e documentata).
  function tradesHref(extra: Record<string, string>): string {
    const query = new URLSearchParams();
    if (period.key === "custom" && period.fromKey && period.toKey) {
      query.set("period", "custom");
      query.set("from", period.fromKey);
      query.set("to", period.toKey);
    } else if (period.key !== "all") {
      query.set("period", period.key);
    }
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    return `/trades?${query.toString()}`;
  }

  /** "YYYY-MM" → label mese leggibile ("luglio 2026"). */
  function monthLabel(month: string): string {
    const label = new Intl.DateTimeFormat("it-IT", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-15T12:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /** Range custom Trade View per un mese "YYYY-MM". */
  function monthHref(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return tradesHref({
      period: "custom",
      from: `${month}-01`,
      to: `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`,
    });
  }

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
          {/* W3 — la review del venerdì generata dai dati */}
          <Button asChild variant="outline">
            <Link href="/reports/settimana">
              <CalendarCheck className="size-4" />
              Report settimanale
            </Link>
          </Button>
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
          {/* F27 — su mobile le sezioni sono collassabili (coerente con F26);
              "Per simbolo" aperta di default: è il report #1. */}
          <CollapsibleCard title="Per simbolo" defaultOpen>
            <BreakdownTable
              currency={currency}
              rows={symbols.map((s) => ({
                key: s.symbol,
                label: s.symbol,
                aggregates: s,
                href: tradesHref({ symbol: s.symbol }),
              }))}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Per strategia">
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
                  href: tradesHref({
                    strategy: s.strategyId ?? NO_STRATEGY_FILTER,
                  }),
                }))}
              />
          </CollapsibleCard>

          <CollapsibleCard title="Per tag">
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
                      href: tradesHref({ tag: t.tagId }),
                    }))}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Un trade può avere più tag: le righe si sovrappongono e le
                    somme non coincidono col totale del conto.
                  </p>
                </>
              )}
          </CollapsibleCard>

          {/* Tabelle a tutta larghezza: affiancate a 1280 taglierebbero le colonne */}
          <div className="flex flex-col gap-4">
            <CollapsibleCard title="Per direzione e asset class">
                <BreakdownTable
                  currency={currency}
                  rows={directionAssets.map((row) => ({
                    key: `${row.direction}-${row.assetClass}`,
                    label: (
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-semibold",
                            row.direction === "LONG" ? "text-profit" : "text-loss",
                          )}
                        >
                          {row.direction}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.assetClass}
                        </span>
                      </span>
                    ),
                    aggregates: row,
                    href: tradesHref({
                      dir: row.direction,
                      asset: row.assetClass,
                    }),
                  }))}
                />
            </CollapsibleCard>
            <CollapsibleCard title="Per mese">
                <BreakdownTable
                  currency={currency}
                  rows={months.map((row) => ({
                    key: row.month,
                    label: monthLabel(row.month),
                    aggregates: row,
                    href: monthHref(row.month),
                  }))}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Mesi di calendario nel tuo fuso, per chiusura del trade:
                  l&apos;unità di misura di payout e challenge.
                </p>
            </CollapsibleCard>
          </div>

          {/* W2 — il cerchio che si chiude: performance col bias vs contro */}
          <CollapsibleCard title="Bias × esecuzione (Macro Desk)">
            {biasRated > 0 ? (
              <>
                <BreakdownTable
                  currency={currency}
                  rows={[
                    ...(biasAligned
                      ? [
                          {
                            key: "aligned",
                            label: (
                              <span className="font-medium text-profit">
                                Col bias del giorno
                              </span>
                            ),
                            aggregates: biasAligned,
                          },
                        ]
                      : []),
                    ...(biasAgainst
                      ? [
                          {
                            key: "against",
                            label: (
                              <span className="font-medium text-loss">
                                Contro il bias
                              </span>
                            ),
                            aggregates: biasAgainst,
                          },
                        ]
                      : []),
                    ...(biasUnrated
                      ? [
                          {
                            key: "unrated",
                            label: (
                              <span className="text-muted-foreground">
                                Non classificati
                              </span>
                            ),
                            aggregates: biasUnrated,
                          },
                        ]
                      : []),
                  ]}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Ogni trade su oro/petrolio/indici è confrontato col bias del
                  report DAILY del suo giorno di APERTURA: LONG col Rialzo (o
                  SHORT col Ribasso) = col bias. Non classificati: simboli
                  fuori dal desk, giornate senza report o bias Neutrale.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun trade classificabile: servono report DAILY del Macro
                Desk nei giorni di apertura dei trade su oro, petrolio o
                indici.
              </p>
            )}
          </CollapsibleCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <CollapsibleCard title={`Per ora di apertura (fuso ${user.timezone})`}>
                <ReportBarChart points={hourSeries} suffix={suffix} />
                <BestWorstLine points={hourSeries} currency={currency} unit="Ora" />
            </CollapsibleCard>
            <CollapsibleCard title="Per giorno della settimana (apertura)">
                <ReportBarChart points={weekdaySeries} suffix={suffix} />
                <BestWorstLine
                  points={weekdaySeries}
                  currency={currency}
                  unit="Giorno"
                />
            </CollapsibleCard>
          </div>

          <CollapsibleCard
            title="Streak"
            titleExtra={<MetricInfo info={streaksInfo} />}
          >
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
          </CollapsibleCard>
        </>
      )}
    </div>
  );
}
