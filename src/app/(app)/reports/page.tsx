import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import {
  ALL_ACCOUNTS,
  TAG_CATEGORY_LABELS,
  type TagCategory,
} from "@/lib/constants";
import {
  avgR,
  avgRInfo,
  avgWinLossR,
  avgWinLossRInfo,
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
import { formatNumber } from "@/lib/format-number";
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
  type ScoredBucket,
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
  getTagCategoryBreakdown,
  getPlanAdherenceBreakdown,
  getSessionBreakdown,
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
import { EXTREME_MIN_TRADES, isExtremeEligible } from "@/lib/metrics/extremes";
import { fillSessionSeries, sessionsInfo } from "@/lib/sessions";
import {
  fillWeekdaySeries as fillWeekdayRows,
  weekdaysInfo,
} from "@/lib/weekdays";
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
 * Trade · Win % · Avg Win/Loss · PF · Expectancy · Net P&L; la fase 4 ha
 * aggiunto «Attesa per trade» in valuta (sicura: ogni vista è già ristretta a
 * una valuta sola). Nessuna formula vive qui: winRate/avgWinLossR/profitFactor/avgR stanno in
 * src/lib/metrics e sono le stesse di ogni altra tabella.
 */
function rowMetrics(row: BreakdownAggregates) {
  // Ogni cella mostra il SOLO valore. Gli intervalli di confidenza della fase 4
  // sono stati tolti dalle tabelle (16/09/2026): il calcolo resta in
  // metrics/confidence.ts e governa ancora l'elezione di migliore e peggiore.
  const expectancyR = avgR(row.rSum, row.rCount);
  const cash = expectancy(row);
  return {
    winRate: formatPercent(winRate(row.wins, row.total)),
    avgWinLoss: formatRatio(avgWinLossR(row)),
    profitFactor: formatProfitFactor(
      profitFactor(row.winSum, row.lossSum),
      row.wins,
    ),
    expectancyR: expectancyR !== null ? formatRMultiple(expectancyR) : "—",
    expectancyCash: cash !== null ? formatCash(cash) : "—",
  };
}

const formatCash = (v: string) => formatNumber(v, { decimals: 2, sign: true });

/** L'attesa per trade in valuta: la stessa formula dell'Expectancy in valuta. */
const cashExpectancyInfo = { ...expectancyInfo, label: "Attesa per trade" };

function BreakdownTable({
  rows,
  currency,
  minTrades,
}: {
  rows: {
    key: string;
    label: React.ReactNode;
    aggregates: BreakdownAggregates;
    /** F31 — drill-down: la riga apre la Trade View già filtrata. */
    href?: string;
  }[];
  currency: string;
  /**
   * Soglia di campione (EXTREME_MIN_TRADES, la stessa dei grafici per ora e
   * giorno): le righe sotto la soglia portano «· sotto N» e una nota in
   * calce. Assente nelle tabelle che non la applicano.
   */
  minTrades?: number;
}) {
  const underSample = (a: BreakdownAggregates) =>
    minTrades !== undefined &&
    a.total > 0 &&
    !isExtremeEligible(a.total, minTrades);
  return (
    <>
      {/* F27 — mobile (< md): card impilate col Net P&L SEMPRE in vista,
          stesso trattamento della Trade View: niente colonne nascoste oltre
          il bordo destro senza indizi. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const m = rowMetrics(row.aggregates);
          // Righe a elenco fisso (sessioni, giorni) possono non avere trade.
          const empty = row.aggregates.total === 0;
          const body = (
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium tabular-nums",
                    empty
                      ? "text-muted-foreground"
                      : pnlColorClass(row.aggregates.netPnl),
                  )}
                >
                  {empty
                    ? "—"
                    : formatSignedMoney(row.aggregates.netPnl, currency)}
                </span>
              </span>
              {empty ? (
                <span className="text-xs text-muted-foreground">
                  Nessun trade
                </span>
              ) : (
                <>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                    <span>
                      {row.aggregates.total} trade ({row.aggregates.wins}W/
                      {row.aggregates.losses}L
                      {row.aggregates.breakevens > 0
                        ? `/${row.aggregates.breakevens}BE`
                        : ""}
                      )
                      {underSample(row.aggregates)
                        ? ` · sotto ${minTrades}`
                        : ""}
                    </span>
                    <span>Win {m.winRate}</span>
                    <span>Avg W/L {m.avgWinLoss}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                    <span>PF {m.profitFactor}</span>
                    <span>Expectancy {m.expectancyR}</span>
                    <span>
                      Attesa {m.expectancyCash} {currency}
                    </span>
                  </span>
                </>
              )}
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
                Attesa per trade <MetricInfo info={cashExpectancyInfo} />
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
            const empty = row.aggregates.total === 0;
            return (
              <TableRow
                key={row.key}
                className={cn(
                  row.href && "relative",
                  empty && "text-muted-foreground",
                )}
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
                  {empty ? (
                    "—"
                  ) : (
                    <>
                      {row.aggregates.total}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({row.aggregates.wins}W/{row.aggregates.losses}L
                        {row.aggregates.breakevens > 0
                          ? `/${row.aggregates.breakevens}BE`
                          : ""}
                        )
                      </span>
                      {underSample(row.aggregates) ? (
                        <span className="ml-1 whitespace-nowrap text-2xs text-muted-foreground">
                          · sotto {minTrades}
                        </span>
                      ) : null}
                    </>
                  )}
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
                <TableCell className="text-right tabular-nums">
                  {m.expectancyCash}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    !empty && pnlColorClass(row.aggregates.netPnl),
                  )}
                >
                  {empty
                    ? "—"
                    : formatSignedMoney(row.aggregates.netPnl, currency)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
      {rows.some((row) => underSample(row.aggregates)) ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Righe con meno di {minTrades} trade: descrivono cosa è successo, non
          bastano per un confronto.
        </p>
      ) : null}
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
  if (extremes.withTrades === 0) return null;
  const { best, worst, overlapping } = extremes;
  // Fase 4: si elegge sull'ATTESA PER TRADE, e solo con intervalli al 95%
  // disgiunti. Sotto 30 trade una fascia resta nel grafico, più chiara, ma
  // non ha stima e non entra nel confronto (fase 2). Gli intervalli decidono
  // l'elezione ma non si scrivono in pagina.
  const perTrade = (p: ScoredBucket) =>
    p.mean?.value
      ? `${formatSignedMoney(p.mean.value, currency)} per trade su ${p.trades} trade`
      : `${p.trades} trade`;
  const rest =
    extremes.withTrades > extremes.eligible
      ? ` Le altre ${extremes.withTrades - extremes.eligible} restano nel grafico, più chiare, senza etichetta.`
      : "";
  if (overlapping) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Nessuna fascia eletta migliore o peggiore: la più alta (
        <span className="font-medium text-foreground">{overlapping.high.label}</span>,{" "}
        {perTrade(overlapping.high)}) e la più bassa (
        <span className="font-medium text-foreground">{overlapping.low.label}</span>,{" "}
        {perTrade(overlapping.low)}) non si distinguono con questi trade. Confronto
        fra le {extremes.eligible} fasce con almeno{" "}
        {EXTREME_MIN_TRADES} trade.{rest}
      </p>
    );
  }
  if (!best || !worst) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {extremes.eligible === 0
          ? `Nessuna fascia arriva a ${EXTREME_MIN_TRADES} trade: nessuna è eletta migliore o peggiore. I numeri restano nel grafico.`
          : `Solo ${extremes.eligible} fascia con almeno ${EXTREME_MIN_TRADES} trade: servono almeno due fasce per un confronto.`}
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {`${unit} migliore `}
      <span className="font-medium text-foreground">{best.label}</span> ({perTrade(best)})
      {" · peggiore "}
      <span className="font-medium text-foreground">{worst.label}</span> ({perTrade(worst)}).
      Eletti fra le {extremes.eligible} fasce con almeno {EXTREME_MIN_TRADES} trade.{rest}
    </p>
  );
}

/** Etichette dei tre bucket di aderenza al piano (F3). */
const PLAN_ADHERENCE_LABELS: Record<string, string> = {
  followed: "Piano rispettato",
  broken: "Piano tradito",
  unanswered: "Non ancora rivisto",
};

export default async function ReportsPage({
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
  const scope = resolveCurrencyScope(currencyTotals, curParam);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

  const [sessions, strategies, tags, tagCategories, planAdherence, symbols, directionAssets, months, hours, weekdays, streaks, outcomes, biasRows] =
    await Promise.all([
      getSessionBreakdown(filter),
      getStrategyBreakdown(filter),
      getTagBreakdown(filter),
      getTagCategoryBreakdown(filter),
      getPlanAdherenceBreakdown(filter),
      getSymbolBreakdown(filter),
      getDirectionAssetBreakdown(filter),
      getMonthBreakdown(filter, user.timezone),
      getHourBreakdown(filter, user.timezone),
      getWeekdayBreakdown(filter, user.timezone),
      getStreakStats(filter),
      getRecentTradeOutcomes(filter),
      getBiasAlignmentBreakdown(filter, user.timezone),
    ]);
  // W2 — bias × esecuzione: righe classificate e non.
  const biasAligned = biasRows.find((r) => r.alignment === "ALIGNED");
  const biasAgainst = biasRows.find((r) => r.alignment === "AGAINST");
  const biasUnrated = biasRows.find((r) => r.alignment === "UNRATED");
  const biasRated = (biasAligned?.total ?? 0) + (biasAgainst?.total ?? 0);
  const totalTrades = strategies.reduce((acc, s) => acc + s.total, 0);
  const hourSeries = fillHourSeries(hours);
  const weekdaySeries = fillWeekdaySeries(weekdays);
  // Tabelle a righe fisse: 4 sessioni, lunedì-venerdì (v. lib/weekdays.ts).
  const sessionRows = fillSessionSeries(sessions);
  const weekdayRows = fillWeekdayRows(weekdays);
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
    // La sequenza della Trade View è ristretta a una valuta: deve essere la
    // stessa della riga da cui si arriva.
    if (scope.multi && scope.active) query.set("cur", scope.active);
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
      <PageHeader
        title="Reports"
        description={
          <>
            {totalTrades} trade chiusi · {period.label}
            {scope.multi
              ? ` · ${currency}`
              : activeAccountId === ALL_ACCOUNTS
                ? " · tutti i conti"
                : ""}
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
          </>
        }
        actions={
          <>
          {/* W3 — la review generata dai dati. Settimana, mese, trimestre
              o anno: il mese è l'unità dei payout, il trimestre quella con
              cui si giudica un sistema, l'anno quella fiscale. */}
          <Button asChild variant="outline">
            <Link href="/reports/settimana">
              <CalendarCheck className="size-4" />
              Report periodico
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
          </>
        }
      />

      {totalTrades === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nessun trade chiuso nel periodo"
          description="I report si popolano con i trade chiusi: allarga il periodo o cambia conto attivo."
        />
      ) : (
        <>
          {/* In testa le due tabelle arrivate dalla Dashboard (16/09/2026).
              Righe fisse, soglia di campione a EXTREME_MIN_TRADES come i
              grafici per ora e giorno; nessun drill-down: la Trade View non
              filtra per sessione né per giorno della settimana. */}
          <CollapsibleCard
            title="Per sessione"
            titleExtra={<MetricInfo info={sessionsInfo} />}
          >
            <BreakdownTable
              currency={currency}
              minTrades={EXTREME_MIN_TRADES}
              rows={sessionRows.map((row) => ({
                key: row.session,
                label: row.label,
                aggregates: row,
              }))}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Per giorno della settimana"
            titleExtra={<MetricInfo info={weekdaysInfo} />}
          >
            <BreakdownTable
              currency={currency}
              minTrades={EXTREME_MIN_TRADES}
              rows={weekdayRows.map((row) => ({
                key: String(row.weekday),
                label: row.label,
                aggregates: row,
              }))}
            />
          </CollapsibleCard>

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
                            {TAG_CATEGORY_LABELS[t.category as TagCategory] ??
                              t.category}
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

          <CollapsibleCard title="Per categoria di tag">
            {tagCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessun tag sui trade del periodo. Assegna una categoria ai tag
                dal form del trade: «errore» è quella che alimenta il costo
                degli errori.
              </p>
            ) : (
              <>
                <BreakdownTable
                  currency={currency}
                  rows={tagCategories.map((row) => ({
                    key: row.category,
                    label:
                      TAG_CATEGORY_LABELS[row.category as TagCategory] ??
                      row.category,
                    aggregates: row,
                  }))}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Quanto pesano gli errori tutti insieme, invece che quindici
                  tag da tre trade l&apos;uno. Dentro una categoria ogni trade
                  conta una volta sola; fra categorie diverse le righe si
                  sovrappongono — un trade può essere insieme un breakout e un
                  errore.
                </p>
              </>
            )}
          </CollapsibleCard>

          <CollapsibleCard title="Piano rispettato">
            {planAdherence.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessun trade chiuso nel periodo.
              </p>
            ) : (
              <>
                <BreakdownTable
                  currency={currency}
                  rows={planAdherence.map((row) => ({
                    key: row.bucket,
                    label: PLAN_ADHERENCE_LABELS[row.bucket] ?? row.bucket,
                    aggregates: row,
                  }))}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Dalla revisione del singolo trade. Se il win rate col piano
                  rispettato non è più alto di quello senza, o il piano non
                  vale niente o non lo stai davvero seguendo. «Non ancora
                  rivisto» è una riga a sé: non è un piano tradito.
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
