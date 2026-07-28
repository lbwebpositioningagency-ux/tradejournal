import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId } from "@/lib/active-account";
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
import { getCurrencyBreakdown, getDailyPnl } from "@/lib/queries/stats";
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
  const userId = session.user.id;

  const [user, activeAccountId, params] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, baseCurrency: true },
    }),
    getActiveAccountId(),
    searchParams,
  ]);

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
          // F36 — daily loss limit del conto: barra di consumo nelle celle.
          select: { currency: true, propDailyLossLimit: true },
        }),
  ]);
  const scope = resolveCurrencyScope(currencyTotals, params.cur);
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

  const [daily, noteRows] = await Promise.all([
    getDailyPnl(
      { ...monthFilter, currency: scope.active },
      user.timezone,
    ),
    prisma.note.findMany({
      where: {
        userId,
        type: "DAILY",
        dayDate: {
          gte: new Date(`${month}-01T00:00:00.000Z`),
          lt: new Date(`${addMonths(month, 1)}-01T00:00:00.000Z`),
        },
      },
      select: { dayDate: true },
    }),
  ]);
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const noteDays = new Set(
    noteRows.map((n) => n.dayDate!.toISOString().slice(0, 10)),
  );

  // F36 — barra del daily loss limit nelle celle: percentuale consumata dal
  // giorno (solo display; visibile solo con conto singolo e regola attiva).
  const dailyLossLimit = activeAccount?.propDailyLossLimit?.toString() ?? null;
  function dailyLossPct(netPnl: string): number | null {
    if (dailyLossLimit === null) return null;
    const loss = new Decimal(netPnl).neg();
    if (loss.lte(0)) return null;
    return Decimal.min(100, loss.div(dailyLossLimit).times(100))
      .toDecimalPlaces(0)
      .toNumber();
  }

  const monthNet = sumPnl(daily.map((d) => d.netPnl));
  const monthTrades = daily.reduce((acc, d) => acc + d.trades, 0);
  const greenDays = daily.filter((d) => new Decimal(d.netPnl).gt(0)).length;
  const weeks = buildMonthWeeks(month);

  // F42 — tinta SCALARE delle celle: l'intensità segue l'entità del giorno
  // rispetto al giorno più grande del mese (3 fasce), non più binaria.
  const maxAbsDay = daily.reduce((acc, d) => {
    const abs = new Decimal(d.netPnl).abs();
    return abs.gt(acc) ? abs : acc;
  }, new Decimal(0));
  function dayTone(netPnl: string): string {
    const value = new Decimal(netPnl);
    if (value.isZero()) return "bg-breakeven/10 hover:bg-breakeven/20";
    const ratio = maxAbsDay.isZero()
      ? new Decimal(1)
      : value.abs().div(maxAbsDay);
    const tier = ratio.gt("0.66") ? 3 : ratio.gt("0.33") ? 2 : 1;
    const palette = value.gt(0)
      ? ["bg-profit/10 hover:bg-profit/20", "bg-profit/20 hover:bg-profit/30", "bg-profit/30 hover:bg-profit/40"]
      : ["bg-loss/10 hover:bg-loss/20", "bg-loss/20 hover:bg-loss/30", "bg-loss/30 hover:bg-loss/40"];
    return palette[tier - 1];
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
                            <span
                              className={cn(
                                "text-2xs font-semibold tabular-nums sm:text-sm",
                                pnlColorClass(data.netPnl),
                              )}
                            >
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
                            {(() => {
                              // F36 — quanto del daily loss limit ha consumato
                              // questo giorno (solo giorni in perdita).
                              const pct = dailyLossPct(data.netPnl);
                              return pct !== null ? (
                                <span
                                  className="mt-auto block h-1 overflow-hidden rounded-full bg-muted"
                                  title={`${pct}% del daily loss limit`}
                                >
                                  <span
                                    className="block h-full rounded-full bg-loss"
                                    style={{ width: `${pct}%` }}
                                  />
                                </span>
                              ) : null;
                            })()}
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
            {dailyLossLimit
              ? " La barra rossa è la quota del daily loss limit consumata dal giorno (chiusure di giornata, niente equity intraday)."
              : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
