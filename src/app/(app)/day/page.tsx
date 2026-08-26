import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { todayKeyInZone, zonedInputToUtc } from "@/lib/dates";
import {
  addMonths,
  buildMonthWeeks,
  isValidMonthKey,
  sumPnl,
} from "@/lib/calendar";
import {
  formatSignedCompact,
  formatSignedMoney,
  formatSignedShort,
  pnlColorClass,
} from "@/lib/money";
import { netPnlInfo } from "@/lib/metrics";
import {
  getCurrencyBreakdown,
  getDailyPnl,
  getNetPnlBefore,
  getStartingBalance,
} from "@/lib/queries/stats";
import { returnIntensity } from "@/lib/metrics";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { cn } from "@/lib/utils";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { MonthPicker } from "./month-picker";
import { MetricInfo } from "@/components/metric-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Calendario" };

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// (la label testuale del mese è sostituita dal month-picker, F42)

export default async function DayCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; cur?: string }>;
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

  const todayKey = todayKeyInZone(user.timezone);
  const currentMonth = todayKey.slice(0, 7);
  const month =
    params.month && isValidMonthKey(params.month) ? params.month : currentMonth;

  // Confini del mese di CALENDARIO nel fuso utente, convertiti in UTC per il
  // filtro su closedAt: stessa convenzione del bucketing SQL.
  const from = zonedInputToUtc(`${month}-01T00:00`, user.timezone);
  const to = zonedInputToUtc(`${addMonths(month, 1)}-01T00:00`, user.timezone);

  const monthFilter = { userId, accountId: activeAccountId, from, to };

  // F6 — valute presenti nel mese e valuta attiva (mai sommare valute diverse).
  const [currencyTotals, activeAccount] = await Promise.all([
    getCurrencyBreakdown(monthFilter),
    activeAccountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({
          where: { id: activeAccountId, userId },
          select: { currency: true },
        }),
  ]);
  const scope = resolveCurrencyScope(currencyTotals, params.cur);
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

  const [daily, noteRows, monthBaseBalance, pnlBeforeMonth] = await Promise.all([
    getDailyPnl(
      { ...monthFilter, currency: scope.active },
      user.timezone,
    ),
    prisma.note.findMany({
      where: {
        // Il journal è PERSONALE: resta dell'utente vero anche in scope demo.
        userId: sessionUserId,
        type: "DAILY",
        dayDate: {
          gte: new Date(`${month}-01T00:00:00.000Z`),
          lt: new Date(`${addMonths(month, 1)}-01T00:00:00.000Z`),
        },
      },
      select: { dayDate: true },
    }),
    // Equity a inizio mese: base delle tinte della heatmap. Senza, l'unica
    // gradazione possibile sarebbe relativa al mese, e due mesi diversi non
    // sarebbero confrontabili fra loro.
    getStartingBalance({ userId, accountId: activeAccountId, currency: scope.active }),
    getNetPnlBefore(
      { userId, accountId: activeAccountId, currency: scope.active },
      new Date(`${month}-01T00:00:00.000Z`),
    ),
  ]);
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const noteDays = new Set(
    noteRows.map((n) => n.dayDate!.toISOString().slice(0, 10)),
  );

  const monthNet = sumPnl(daily.map((d) => d.netPnl));
  const monthTrades = daily.reduce((acc, d) => acc + d.trades, 0);
  const greenDays = daily.filter((d) => new Decimal(d.netPnl).gt(0)).length;
  const weeks = buildMonthWeeks(month);

  /* HEATMAP: gradazione su soglie ASSOLUTE in frazione di equity, le stesse
     del calendario mensile (una convenzione sola per tutte le heatmap
     dell'app). Prima l'intensità era relativa al giorno più grande DEL MESE:
     due mesi non erano confrontabili e un mese con una giornata eccezionale
     schiacciava tutte le altre a tinta chiara.

     Senza un'equity positiva a inizio mese non esiste un ritorno: le celle
     restano tinte al livello più basso, che dice il SEGNO senza pretendere
     di dire la magnitudine. */
  const monthEquity = new Decimal(monthBaseBalance).plus(pnlBeforeMonth);
  function dayTone(netPnl: string): string {
    const value = new Decimal(netPnl);
    if (value.isZero()) return "bg-breakeven/10 hover:bg-breakeven/20";
    const ret = monthEquity.gt(0) ? value.div(monthEquity).toFixed(8) : null;
    const tier = ret === null ? 1 : returnIntensity(ret, "day");
    const palette =
      value.gt(0)
        ? ["bg-profit/10 hover:bg-profit/20", "bg-profit/20 hover:bg-profit/30", "bg-profit/30 hover:bg-profit/40"]
        : ["bg-loss/10 hover:bg-loss/20", "bg-loss/20 hover:bg-loss/30", "bg-loss/30 hover:bg-loss/40"];
    return palette[Math.max(1, tier) - 1];
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Calendario</h1>
          <p className="page-subtitle flex items-center gap-1">
            {daily.length === 0 ? (
              "Nessun trade chiuso nel mese"
            ) : (
              <>
                <span className={cn("font-medium", pnlColorClass(monthNet))}>
                  {formatSignedMoney(monthNet, currency)}
                </span>
                {` · ${monthTrades} trade · ${greenDays} giorni verdi su ${daily.length}${scope.multi ? ` · ${currency}` : ""}`}
                <MetricInfo info={netPnlInfo} />
              </>
            )}
          </p>
          {scope.multi ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Totali del mese per valuta (mai sommati):{" "}
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
        <div className="flex items-center gap-2">
          {scope.multi ? (
            <CurrencyFilter
              currencies={currencyTotals.map((t) => t.currency)}
              active={currency}
            />
          ) : null}
          <Button asChild variant="outline" size="icon" aria-label="Mese precedente">
            <Link href={`/day?month=${addMonths(month, -1)}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          {/* F42 — month-picker: salto diretto senza frecce ±1 in serie */}
          <MonthPicker month={month} />
          <Button asChild variant="outline" size="icon" aria-label="Mese successivo">
            <Link href={`/day?month=${addMonths(month, 1)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          {month !== currentMonth ? (
            <Button asChild variant="outline">
              <Link href="/day">Oggi</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="py-4">
        {/* Sotto sm le celle giorno hanno ~34px utili: padding, gap e colonna
            settimana ridotti + formato importi ultra-compatto (formatSignedShort).
            Da sm in su il layout resta IDENTICO a prima. */}
        <CardContent className="px-2 sm:px-4">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_3rem] gap-0.5 sm:grid-cols-[repeat(7,minmax(0,1fr))_4.5rem] sm:gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}
            <div className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sett.
            </div>

            {weeks.map((week) => {
              const weekDaysWithData = week.filter((d) => byDay.has(d));
              const weekNet = sumPnl(
                weekDaysWithData.map((d) => byDay.get(d)!.netPnl),
              );
              return (
                <div key={week[0]} className="contents">
                  {week.map((date) => {
                    const inMonth = date.startsWith(month);
                    const data = byDay.get(date);
                    const dayNumber = Number(date.slice(8, 10));
                    const isToday = date === todayKey;

                    if (!inMonth) {
                      return (
                        <div
                          key={date}
                          className="min-h-20 rounded-md border border-transparent p-1.5 text-xs text-muted-foreground/40"
                        >
                          {dayNumber}
                        </div>
                      );
                    }

                    const tone = data ? dayTone(data.netPnl) : "hover:bg-accent";

                    return (
                      <Link
                        key={date}
                        href={
                          scope.multi
                            ? `/day/${date}?cur=${currency}`
                            : `/day/${date}`
                        }
                        className={cn(
                          "flex min-h-20 flex-col gap-0.5 overflow-hidden rounded-md border px-0.5 py-1 transition-colors sm:p-1.5",
                          tone,
                          isToday ? "ring-1 ring-primary" : "border-border/60",
                        )}
                      >
                        <span className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{dayNumber}</span>
                          {noteDays.has(date) ? (
                            <NotebookPen className="size-3" aria-label="Nota di giornata" />
                          ) : null}
                        </span>
                        {data ? (
                          <>
                            {/* F4 — testo NON colorato sulla cella tinta: il
                                token P&L sopra una velatura di se stesso non
                                arriva a 4,5:1 (misurato: 3,51 in dark al 30%).
                                Il segno resta leggibile — lo porta il + o il
                                − del numero — e la tinta della cella resta a
                                dire l'intensità. */}
                            <span className="text-2xs font-semibold tabular-nums sm:text-sm">
                              <span className="sm:hidden">
                                {formatSignedShort(data.netPnl)}
                              </span>
                              <span className="hidden sm:inline">
                                {formatSignedCompact(data.netPnl)}
                              </span>
                            </span>
                            <span className="text-2xs text-muted-foreground">
                              <span className="sm:hidden">{data.trades}</span>
                              <span className="hidden sm:inline">
                                {data.trades} trade
                              </span>
                            </span>
                          </>
                        ) : null}
                      </Link>
                    );
                  })}
                  <div
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center overflow-hidden rounded-md bg-muted/40 p-0.5 text-xs tabular-nums sm:p-1.5",
                      weekDaysWithData.length > 0
                        ? pnlColorClass(weekNet)
                        : "text-muted-foreground/50",
                    )}
                  >
                    {weekDaysWithData.length > 0 ? (
                      <>
                        <span className="font-semibold">
                          <span className="sm:hidden">
                            {formatSignedShort(weekNet)}
                          </span>
                          <span className="hidden sm:inline">
                            {formatSignedCompact(weekNet)}
                          </span>
                        </span>
                        <span className="text-2xs text-muted-foreground">
                          <span className="sm:hidden">
                            {weekDaysWithData.reduce(
                              (acc, d) => acc + byDay.get(d)!.trades,
                              0,
                            )}
                          </span>
                          <span className="hidden sm:inline">
                            {weekDaysWithData.reduce(
                              (acc, d) => acc + byDay.get(d)!.trades,
                              0,
                            )}{" "}
                            trade
                          </span>
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Importi in {currency}
            {scope.multi
              ? " · altre valute con totali separati (mai sommate)"
              : activeAccountId === ALL_ACCOUNTS
                ? " · tutti i conti non archiviati"
                : ""}
            . I giorni seguono il tuo fuso orario.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
