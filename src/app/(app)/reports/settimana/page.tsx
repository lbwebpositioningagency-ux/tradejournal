import { PageHeader } from "@/components/layout/page-header";
import { SegmentedNav } from "@/components/ui/segmented";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ChevronLeft, ChevronRight, Download, FileDown } from "lucide-react";
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
  REPORT_BOTH_LABELS,
  REPORT_IN_THIS_LABELS,
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
import { withCurrencyParam } from "@/lib/currency-nav";
import {
  formatPercent,
  formatProfitFactor,
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
 * W3 — REPORT PERIODICO: il digest generato dalle STESSE formule testate del
 * resto dell'app (zero AI, zero allucinazioni, tutto verificabile),
 * impaginato per la stampa/PDF nativi del browser.
 *
 * F5 — nato settimanale («il report del venerdì»), ora su quattro intervalli:
 * il mese è l'unità dei payout e delle challenge, il trimestre quella con cui
 * si giudica un sistema, l'anno quella fiscale. L'URL resta quello e il
 * default resta la settimana, così i segnalibri non si rompono.
 */

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

  // La valuta scelta resta nelle frecce e nel cambio di periodo: senza `cur`
  // il periodo accanto tornava alla valuta prevalente.
  const keptCurrency = typeof params.cur === "string" && params.cur ? params.cur : undefined;
  const hrefFor = (nextRange: ReportRange, nextKey: string) =>
    withCurrencyParam(`/reports/settimana?r=${nextRange}&w=${nextKey}`, keptCurrency);

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
      <PageHeader
        className="print:hidden"
        back={{ href: "/reports", label: "Reports" }}
        title="Report periodico"
        description={<>La review, generata dai tuoi numeri{scope.multi ? ` · ${currency}` : ""}</>}
        actions={
          <>
        {/* Due gruppi che vanno a capo fra loro (a 390px la fila unica
            allargava la pagina a 627px): prima ciò che sposta la vista,
            poi le azioni. Regola della tavola «Correzioni P0». */}
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          {/* Selettore dell'intervallo: link e non bottoni, la scelta vive
              nella query string come ogni altro filtro dell'app. */}
          <SegmentedNav
            label="Intervallo del report"
            items={REPORT_RANGES.map((option) => ({
              key: option,
              href: hrefFor(option, startOfRange(start, option)),
              label: REPORT_RANGE_LABELS[option],
              active: option === range,
            }))}
          />
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
        </div>
        <div className="flex items-center gap-2">
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
          <Button asChild variant="outline" size="sm">
            {/* Export PDF VERO: un file, non la finestra di stampa. Stessa
                uscita su ogni macchina, nome deterministico, allegabile. */}
            <a
              href={`/api/export/report/pdf?r=${range}&w=${start}${
                scope.active ? `&cur=${scope.active}` : ""
              }`}
              download
            >
              <FileDown className="size-4" />
              PDF
            </a>
          </Button>
          <PrintButton />
        </div>
        </div>
          </>
        }
      />

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
              Nessun trade chiuso {REPORT_IN_THIS_LABELS[range]}.
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
                      ? `${formatSignedMoney(new Decimal(agg.netPnl).minus(prevAgg.netPnl).toFixed(2), currency)} vs ${REPORT_PREVIOUS_LABELS[range]}`
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
                    {formatProfitFactor(pf, agg.wins)}
                  </p>
                  <p className="stat-sub mt-0.5">
                    Attesa/trade{" "}
                    {exp !== null ? formatSignedMoney(exp, currency) : "—"}
                  </p>
                </div>
              </div>

              {/* Estremi del periodo */}
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
                <p className="stat-label mb-2">
                  Errori taggati · {REPORT_RANGE_LABELS[range].toLowerCase()}
                </p>
                {mistakes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun tag errore sui trade del periodo: o disciplina
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
                  ? ` Scope valuta: ${currency} su ${REPORT_BOTH_LABELS[range]} ` +
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
