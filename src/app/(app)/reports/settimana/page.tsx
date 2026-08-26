import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { isValidDateKey } from "@/lib/calendar";
import { formatDayKey, todayKeyInZone, zonedInputToUtc } from "@/lib/dates";
import {
  endOfRange,
  isReportRange,
  nextStart,
  previousStart,
  REPORT_PREVIOUS_LABELS,
  REPORT_RANGES,
  REPORT_RANGE_LABELS,
  reportRangeLabel,
  startOfRange,
  type ReportRange,
} from "@/lib/report-period";
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

export const metadata: Metadata = { title: "Report periodico" };

/**
 * W3 — «Report del venerdì»: digest della settimana generato dalle STESSE
 * formule testate del resto dell'app (zero AI, zero allucinazioni, tutto
 * verificabile), impaginato per la stampa/PDF nativi del browser.
 */

/** Delta leggibile fra due importi (stringhe decimali). */
function deltaLabel(current: string, previous: string): string {
  const delta = new Decimal(current).minus(previous);
  return `${delta.gte(0) ? "+" : ""}${delta.toFixed(2)}`;
}

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; r?: string; cur?: string }>;
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

  /* Intervallo richiesto (?r=) e periodo richiesto (?w=): entrambi con
     parsing LENIENT come ogni altro filtro dell'app — un valore non
     riconosciuto torna al default invece di rompere la pagina. Il default è
     la settimana corrente, che era l'unico comportamento possibile prima. */
  const range: ReportRange = isReportRange(params.r) ? params.r : "settimana";
  const todayKey = todayKeyInZone(user.timezone);
  const start = startOfRange(
    params.w && isValidDateKey(params.w) ? params.w : todayKey,
    range,
  );
  const prevStart = previousStart(start, range);

  const bounds = (fromKey: string): { from: Date; to: Date } => ({
    from: zonedInputToUtc(`${fromKey}T00:00`, user.timezone),
    // Estremo destro ESCLUSO: il primo giorno del periodo successivo, mai
    // l'ultimo di questo — sbagliarlo perde un giorno di trade in silenzio.
    to: zonedInputToUtc(`${endOfRange(fromKey, range)}T00:00`, user.timezone),
  });

  const hrefFor = (nextRange: ReportRange, nextKey: string) =>
    `/reports/settimana?r=${nextRange}&w=${nextKey}`;

  const baseFilter: StatsFilter = {
    userId,
    accountId: activeAccountId,
    ...bounds(start),
  };

  // F6 — stesso scope valuta dei Reports: mai sommare valute diverse.
  // B-03 — lo scope si risolve sull'UNIONE delle due settimane confrontate:
  // con la valuta della sola settimana corrente, una settimana precedente
  // operata in un'altra valuta risulterebbe "0 trade" (delta bugiardi), e
  // con settimana corrente vuota il confronto sommerebbe valute diverse.
  const currencyTotals = await getCurrencyBreakdown({
    userId,
    accountId: activeAccountId,
    from: bounds(prevStart).from,
    to: bounds(start).to,
  });
  const scope = resolveCurrencyScope(currencyTotals, params.cur);
  const filter: StatsFilter = { ...baseFilter, currency: scope.active };
  const prevFilter: StatsFilter = { ...filter, ...bounds(prevStart) };
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
            <h1 className="page-title">Report periodico</h1>
            <p className="page-subtitle">
              La review, generata dai tuoi numeri
              {scope.multi ? ` · ${currency}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selettore dell'intervallo: link e non bottoni, la scelta vive
              nella query string come ogni altro filtro dell'app. */}
          <div
            className="inline-flex items-center gap-1 rounded-md border p-0.5"
            role="group"
            aria-label="Intervallo del report"
          >
            {REPORT_RANGES.map((option) => (
              <Link
                key={option}
                href={hrefFor(option, startOfRange(start, option))}
                aria-current={option === range ? "true" : undefined}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  option === range
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {REPORT_RANGE_LABELS[option]}
              </Link>
            ))}
          </div>
          <Button asChild variant="outline" size="icon" aria-label={`${REPORT_RANGE_LABELS[range]} precedente`}>
            <Link href={hrefFor(range, prevStart)}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label={`${REPORT_RANGE_LABELS[range]} successivo`}>
            <Link href={hrefFor(range, nextStart(start, range))}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            {/* CSV dei NUMERI del report, non dei trade grezzi: sono due
                bisogni diversi e due file diversi. */}
            <a
              href={`/api/export/report?r=${range}&w=${start}${
                scope.active ? `&cur=${scope.active}` : ""
              }`}
              download
            >
              <Download className="size-4" />
              CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
            <span>
              {REPORT_RANGE_LABELS[range]} {reportRangeLabel(start, range)}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              L&B TradingSpace
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
              {/* Numeri chiave, con confronto sul periodo precedente */}
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
                      ? `${deltaLabel(agg.netPnl, prevAgg.netPnl)} ${currency} vs ${REPORT_PREVIOUS_LABELS[range]}`
                      : `${REPORT_PREVIOUS_LABELS[range]} senza trade`}
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
                  ? " Scope valuta: " + currency + " su ENTRAMBE le settimane " +
                    "(confronto a parità di valuta, mai somme cross-valuta)."
                  : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
