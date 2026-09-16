import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { CalendarOff, ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeAccountWhere } from "@/lib/active-account";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { withCurrencyParam } from "@/lib/currency-nav";
import {
  getCurrencyBreakdown,
  getNetPnlBefore,
  getStartingBalance,
} from "@/lib/queries/stats";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { resolveTradeScope } from "@/lib/demo-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import {
  addDays,
  calendarHref,
  weekDays,
  weekRangeLabel,
  weekStartOf,
} from "@/lib/calendar";
import { formatDateTime, todayKeyInZone, zonedInputToUtc } from "@/lib/dates";
import {
  classifyOutcome,
  netPnlInfo,
  profitFactor,
  profitFactorInfo,
  returnIntensity,
  streakSummary,
  streaksInfo,
  winRate,
  winRateInfo,
} from "@/lib/metrics";
import { HEAT_TEXT, HEAT_TEXT_MUTED, heatTone } from "@/lib/heat-scale";
import { TradeSequenceChart } from "@/components/charts/trade-sequence-chart";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import {
  IntradayPnlChart,
  type IntradayPoint,
} from "@/components/day/intraday-pnl-chart";
import {
  formatMoney,
  formatPercent,
  formatRMultiple,
  formatSignedCompact,
  formatSignedMoney,
  formatSignedShort,
  pnlColorClass,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { WeekNoteEditor } from "./week-note-editor";

export const metadata: Metadata = { title: "Settimana" };

const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/**
 * VISTA SETTIMANA — la Giornata (`day/[date]`) allargata a lunedì→domenica,
 * la stessa riga del calendario mensile: il totale qui è quello della cella
 * «Sett.» che apre la pagina. Stessi blocchi nello stesso ordine (card,
 * grafici, tabella, journal) più la striscia dei sette giorni; il journal è
 * una nota PROPRIA della settimana (tabella WeekNote), non la somma dei
 * giorni. Disposizione: tavola Claude Design «Journal - vista Settimana».
 *
 * `date` è sempre un lunedì: il layout rimanda lì ogni altro giorno.
 */
export default async function WeekViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ cur?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sessionUserId = session.user.id;

  const { date: week } = await params;

  const [user, tradeScope, { cur }] = await Promise.all([
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
  const curParam = typeof cur === "string" && cur ? cur : undefined;

  // Confini della settimana di calendario nel fuso utente (closedAt), come
  // la Giornata e il bucketing SQL del calendario.
  const days = weekDays(week);
  const start = zonedInputToUtc(`${week}T00:00`, user.timezone);
  const end = zonedInputToUtc(`${addDays(week, 7)}T00:00`, user.timezone);

  // F6 — la valuta si risolve sui trade DELLA SETTIMANA, come nella Giornata:
  // con conti in euro e in dollari i numeri sono di una valuta sola, mai
  // sommati, e la descrizione dice quanti trade dell'altra restano fuori.
  const weekCurrencies = await getCurrencyBreakdown({
    userId,
    accountId: activeAccountId,
    from: start,
    to: end,
  });
  const scope = resolveCurrencyScope(weekCurrencies, curParam);
  const scopeCurrency = scope.active ?? curParam;
  const accountWhere = tradeAccountWhere(userId, activeAccountId, scopeCurrency);
  const keptCurrency = scope.multi ? scope.active : curParam;
  const navWhere = tradeAccountWhere(userId, activeAccountId, keptCurrency);

  // Frecce sulle settimane OPERATIVE, come i giorni operativi della Giornata
  // (F44): mai una catena di settimane vuote.
  const [prevOperative, nextOperative] = await Promise.all([
    prisma.trade.findFirst({
      where: { ...navWhere, status: "CLOSED", closedAt: { lt: start } },
      orderBy: { closedAt: "desc" },
      select: { closedAt: true },
    }),
    prisma.trade.findFirst({
      where: { ...navWhere, status: "CLOSED", closedAt: { gte: end } },
      orderBy: { closedAt: "asc" },
      select: { closedAt: true },
    }),
  ]);
  const prevWeekKey = prevOperative?.closedAt
    ? weekStartOf(todayKeyInZone(user.timezone, prevOperative.closedAt))
    : null;
  const nextWeekKey = nextOperative?.closedAt
    ? weekStartOf(todayKeyInZone(user.timezone, nextOperative.closedAt))
    : null;

  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const [trades, weekNote, dayNoteRows, activeAccount, baseBalance, pnlBefore] =
    await Promise.all([
      prisma.trade.findMany({
        where: {
          ...accountWhere,
          status: "CLOSED",
          closedAt: { gte: start, lt: end },
        },
        orderBy: { closedAt: "asc" },
        include: {
          account: { select: { name: true, currency: true } },
          strategy: { select: { name: true } },
        },
      }),
      // Journal e allegati sono PERSONALI: restano dell'utente vero anche
      // mentre si guardano i trade del conto demo. Mai `data` nei listing.
      prisma.weekNote.findFirst({
        where: { userId: sessionUserId, weekStart },
        select: {
          content: true,
          attachments: {
            orderBy: { createdAt: "asc" },
            select: { id: true, fileName: true, mimeType: true, size: true },
          },
        },
      }),
      // Quali giorni hanno un journal: solo l'icona nella striscia.
      prisma.note.findMany({
        where: {
          userId: sessionUserId,
          type: "DAILY",
          dayDate: { gte: weekStart, lt: new Date(`${addDays(week, 7)}T00:00:00.000Z`) },
        },
        select: { dayDate: true },
      }),
      activeAccountId === ALL_ACCOUNTS
        ? null
        : prisma.tradingAccount.findFirst({
            where: { id: activeAccountId, userId },
            select: { currency: true },
          }),
      // Equity a inizio settimana: base delle tinte della striscia, con le
      // soglie del calendario (`returnIntensity(…, "day")`).
      getStartingBalance({ userId, accountId: activeAccountId, currency: scope.active }),
      getNetPnlBefore(
        { userId, accountId: activeAccountId, currency: scope.active },
        start,
      ),
    ]);

  const currency = scopeCurrency ?? activeAccount?.currency ?? user.baseCurrency;
  const noteDays = new Set(
    dayNoteRows.map((n) => n.dayDate!.toISOString().slice(0, 10)),
  );

  // Poche righe, già caricate per la tabella: le somme restano Decimal.
  const pointFormat = new Intl.DateTimeFormat("it-IT", {
    timeZone: user.timezone,
    weekday: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const points: IntradayPoint[] = [];
  const byDay = new Map<string, { net: Decimal; trades: number }>();
  let net = new Decimal(0);
  let fees = new Decimal(0);
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let winSum = new Decimal(0);
  let lossSum = new Decimal(0);
  let rSum = new Decimal(0);
  let rCount = 0;
  for (const trade of trades) {
    const pnl = new Decimal(trade.netPnl.toString());
    net = net.plus(pnl);
    fees = fees.plus(trade.fees.toString());
    if (pnl.gt(0)) {
      wins += 1;
      winSum = winSum.plus(pnl);
    } else if (pnl.lt(0)) {
      losses += 1;
      lossSum = lossSum.plus(pnl);
    } else breakevens += 1;
    if (trade.rMultiple !== null) {
      rSum = rSum.plus(trade.rMultiple.toString());
      rCount += 1;
    }
    if (trade.closedAt) {
      const key = todayKeyInZone(user.timezone, trade.closedAt);
      const bucket = byDay.get(key) ?? { net: new Decimal(0), trades: 0 };
      bucket.net = bucket.net.plus(pnl);
      bucket.trades += 1;
      byDay.set(key, bucket);
    }
    points.push({
      time: trade.closedAt ? pointFormat.format(trade.closedAt) : "—",
      symbol: trade.symbol,
      cumulative: net.toFixed(2),
    });
  }
  const weekWinRate = winRate(wins, trades.length);
  const weekProfitFactor = profitFactor(winSum.toFixed(2), lossSum.toFixed(2));
  const weekRuns = streakSummary(
    trades.map((t) => classifyOutcome(t.netPnl.toString())),
  );
  const tradedDays = [...byDay.values()];
  const greenDays = tradedDays.filter((d) => d.net.gt(0)).length;

  const weekEquity = new Decimal(baseBalance).plus(pnlBefore);
  function dayTone(value: Decimal): string {
    if (value.isZero()) return "bg-breakeven/10";
    const ret = weekEquity.gt(0) ? value.div(weekEquity).toFixed(8) : null;
    const tier = ret === null ? 1 : returnIntensity(ret, "day");
    return heatTone(value.gt(0) ? "profit" : "loss", tier);
  }

  const label = weekRangeLabel(week);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{
          // Il calendario vive nella Dashboard: si torna al mese che contiene
          // il giovedì, cioè quello in cui la settimana ha più giorni.
          href: calendarHref(addDays(week, 3).slice(0, 7), {
            currency: keptCurrency,
            anchor: true,
          }),
          label: "Calendario",
        }}
        title={`Settimana ${label}`}
        description={
          trades.length === 0
            ? "Nessun trade chiuso in questa settimana"
            : `${trades.length} trade chiusi · ${wins} W · ${losses} L${breakevens > 0 ? ` · ${breakevens} BE` : ""} · ${greenDays} ${greenDays === 1 ? "giorno verde" : "giorni verdi"} su ${tradedDays.length}${
                scope.multi
                  ? ` · solo ${currency}: ${weekCurrencies
                      .filter((t) => t.currency !== currency)
                      .map((t) => `${t.trades} in ${t.currency}`)
                      .join(", ")} non sommati`
                  : ""
              }`
        }
        actions={
          <>
            {scope.multi ? (
              <CurrencyFilter
                currencies={weekCurrencies.map((t) => t.currency)}
                active={currency}
              />
            ) : null}
            {prevWeekKey ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label={`Settimana operativa precedente (dal ${prevWeekKey})`}
              >
                <Link href={withCurrencyParam(`/week/${prevWeekKey}`, keptCurrency)}>
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label="Nessuna settimana operativa precedente"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            {nextWeekKey ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label={`Settimana operativa successiva (dal ${nextWeekKey})`}
              >
                <Link href={withCurrencyParam(`/week/${nextWeekKey}`, keptCurrency)}>
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label="Nessuna settimana operativa successiva"
              >
                <ChevronRight className="size-4" />
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="stat-label flex items-center gap-1">
              Net P&L
              <MetricInfo info={netPnlInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className={cn("stat-value-hero", pnlColorClass(net.toFixed(2)))}>
              {formatSignedMoney(net.toFixed(2), currency)}
            </p>
            <p className="stat-sub mt-1">
              Fee {formatMoney(fees.toFixed(2), currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="stat-label flex items-center gap-1">
              Win rate della settimana
              <MetricInfo info={winRateInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="stat-value">{formatPercent(weekWinRate)}</p>
            <p className="stat-sub mt-1">{trades.length} trade chiusi</p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="stat-label flex items-center gap-1">
              Qualità della settimana
              <MetricInfo info={profitFactorInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="stat-value">
              PF{" "}
              {weekProfitFactor !== null
                ? formatRMultiple(weekProfitFactor).slice(0, -1)
                : wins > 0
                  ? "∞"
                  : "—"}
            </p>
            <p className="stat-sub mt-1">
              {rCount > 0
                ? `R totale ${formatRMultiple(rSum.toFixed(4))} su ${rCount} trade con rischio`
                : "Nessun trade con rischio definito"}
              {" · "}
              {activeAccountId === ALL_ACCOUNTS
                ? `tutti i conti (${currency})`
                : trades[0]?.account.name ?? currency}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Striscia dei sette giorni: quale giornata ha fatto la settimana.
          Stessa tinta a intensità del calendario (scala condivisa heat-* e
          soglie di returnIntensity per il giorno); testo sui token heat-*,
          validati a 4,5:1 sulla tinta più forte. Ogni casella apre la sua
          Giornata. */}
      <nav aria-label="Giorni della settimana" className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.map((day, i) => {
          const data = byDay.get(day);
          return (
            <Link
              key={day}
              href={withCurrencyParam(`/day/${day}`, keptCurrency)}
              aria-label={`Apri ${WEEKDAY_SHORT[i]} ${Number(day.slice(8, 10))}${data ? ` (${data.trades} trade)` : ""}`}
              className={cn(
                "flex min-h-16 flex-col gap-0.5 overflow-hidden rounded-md border px-1 py-1 transition-colors hover:border-foreground/40 sm:p-2",
                data ? cn(dayTone(data.net), "border-border/60") : "border-border/60 bg-card hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-between gap-1 text-xs",
                  data ? HEAT_TEXT_MUTED : "text-muted-foreground",
                )}
              >
                <span>
                  <span className="max-sm:hidden">{WEEKDAY_SHORT[i]} </span>
                  {Number(day.slice(8, 10))}
                </span>
                {noteDays.has(day) ? (
                  <NotebookPen className="size-3 shrink-0" aria-label="Journal di giornata" />
                ) : null}
              </span>
              {data ? (
                <>
                  <span className={cn("text-2xs font-semibold tabular-nums sm:text-sm", HEAT_TEXT)}>
                    <span className="sm:hidden">{formatSignedShort(data.net.toFixed(2))}</span>
                    <span className="hidden sm:inline">{formatSignedCompact(data.net.toFixed(2))}</span>
                  </span>
                  <span className={cn("text-2xs", HEAT_TEXT_MUTED)}>
                    {data.trades}
                    <span className="max-sm:hidden"> trade</span>
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </Link>
          );
        })}
      </nav>

      {trades.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="stat-label">
                P&L cumulativo (progressione per trade)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IntradayPnlChart points={points} suffix={` ${currency}`} />
              <p className="stat-sub mt-1">
                Un punto per trade chiuso nella settimana, in ordine di
                chiusura: la distanza orizzontale non è tempo.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="stat-label flex items-center gap-1">
                Sequenza trade
                <MetricInfo info={streaksInfo} />
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Max Win Streak{" "}
                  <span className="font-semibold text-profit">{weekRuns.maxWin}</span>
                </span>
                <span>
                  Max Loss Streak{" "}
                  <span className="font-semibold text-loss">{weekRuns.maxLoss}</span>
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <TradeSequenceChart
                points={points.map((p, i) => ({
                  label: p.time,
                  symbol: p.symbol,
                  netPnl: trades[i].netPnl.toString(),
                }))}
                suffix={` ${currency}`}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trade della settimana</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <EmptyState
              compact
              icon={CalendarOff}
              title="Nessun trade chiuso in questa settimana"
              description="La settimana va da lunedì a domenica nel tuo fuso orario, come le righe del calendario."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chiusura</TableHead>
                    <TableHead>Simbolo</TableHead>
                    <TableHead>Direzione</TableHead>
                    <TableHead className="text-right">Net P&L</TableHead>
                    <TableHead className="text-right">R</TableHead>
                    <TableHead>Strategia</TableHead>
                    <TableHead>Conto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((trade) => (
                    <TableRow key={trade.id} className="relative">
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/trades/${trade.id}`}
                          className="absolute inset-0"
                          aria-label={`Apri trade ${trade.symbol}`}
                        />
                        {trade.closedAt
                          ? formatDateTime(trade.closedAt, user.timezone)
                          : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={trade.direction === "LONG" ? "text-profit" : "text-loss"}
                        >
                          {trade.direction}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          pnlColorClass(trade.netPnl.toString()),
                        )}
                      >
                        {formatSignedMoney(trade.netPnl.toString(), trade.account.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {trade.rMultiple ? formatRMultiple(trade.rMultiple.toString()) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {trade.strategy?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {trade.account.name}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal della settimana</CardTitle>
        </CardHeader>
        <CardContent>
          <WeekNoteEditor
            week={week}
            initialContent={weekNote?.content ?? ""}
            attachments={weekNote?.attachments ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
