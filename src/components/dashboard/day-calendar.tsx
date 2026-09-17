import Link from "next/link";
import Decimal from "decimal.js";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { prisma } from "@/lib/db";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { zonedInputToUtc } from "@/lib/dates";
import {
  addMonths,
  buildMonthWeeks,
  CALENDAR_ANCHOR,
  calendarHref,
  isValidMonthKey,
  sumPnl,
} from "@/lib/calendar";
import {
  formatSignedCompact,
  formatSignedMoney,
  formatSignedShort,
  pnlColorClass,
} from "@/lib/money";
import { netPnlInfo, returnIntensity } from "@/lib/metrics";
import {
  getCurrencyBreakdown,
  getDailyPnl,
  getNetPnlBefore,
  getStartingBalance,
} from "@/lib/queries/stats";
import { HEAT_TEXT, HEAT_TEXT_MUTED, heatTone } from "@/lib/heat-scale";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { withCurrencyParam } from "@/lib/currency-nav";
import { cn } from "@/lib/utils";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { MetricInfo } from "@/components/metric-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthPicker } from "./month-picker";

/**
 * Calendario mensile della Dashboard — la stessa vista che fino al 16/09/2026
 * era la pagina a sé `/day`, spostata qui senza ridurla: stesse celle, stesse
 * frecce, month-picker e «Oggi», stessa heatmap sulle soglie assolute.
 *
 * Sezione FISSA, non un widget nascondibile. Componente server: le sue query
 * girano accanto a quelle della Dashboard e arrivano al client già risolte.
 * Il mese sta in `?month=` della Dashboard; i link conservano gli altri
 * parametri (periodo, valuta) perché cambiare mese non resetti la pagina.
 *
 * Ha sostituito anche il mini-calendario mobile (F26), che mostrava lo
 * stesso mese in forma ridotta e portava a questa vista.
 */

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export async function DayCalendar({
  sessionUserId,
  userId,
  activeAccountId,
  timezone,
  baseCurrency,
  todayKey,
  params,
  showCurrencyFilter,
}: {
  /** Utente vero: il journal (note di giornata) è personale anche in demo. */
  sessionUserId: string;
  /** Scope dei trade (utente di sistema col conto demo SIM1). */
  userId: string;
  activeAccountId: string;
  timezone: string;
  baseCurrency: string;
  todayKey: string;
  /** Parametri della Dashboard in URL, da conservare nei link del calendario. */
  params: Record<string, string | undefined>;
  /**
   * Il selettore valuta della testata della Dashboard scrive lo stesso
   * `?cur`: se è già visibile lassù, un secondo qui sarebbe un doppione.
   */
  showCurrencyFilter: boolean;
}) {
  const currentMonth = todayKey.slice(0, 7);
  const month =
    params.month && isValidMonthKey(params.month) ? params.month : currentMonth;

  // Confini del mese di CALENDARIO nel fuso utente, convertiti in UTC per il
  // filtro su closedAt: stessa convenzione del bucketing SQL.
  const from = zonedInputToUtc(`${month}-01T00:00`, timezone);
  const to = zonedInputToUtc(`${addMonths(month, 1)}-01T00:00`, timezone);

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
  // Valuta da portare nei link (giorni, frecce, «Oggi»): quella attiva quando
  // il mese ne ha più d'una. Senza, il mese accanto tornava alla prevalente.
  const keptCurrency = scope.multi ? scope.active : undefined;
  const currency = scope.active ?? activeAccount?.currency ?? baseCurrency;

  const [daily, noteRows, monthBaseBalance, pnlBeforeMonth] = await Promise.all([
    getDailyPnl({ ...monthFilter, currency: scope.active }, timezone),
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
     dell'app). Senza un'equity positiva a inizio mese non esiste un ritorno:
     le celle restano tinte al livello più basso, che dice il SEGNO senza
     pretendere di dire la magnitudine. */
  const monthEquity = new Decimal(monthBaseBalance).plus(pnlBeforeMonth);
  function dayTone(netPnl: string): string {
    const value = new Decimal(netPnl);
    if (value.isZero()) return "bg-breakeven/10 border-border/60 hover:border-foreground/40";
    const ret = monthEquity.gt(0) ? value.div(monthEquity).toFixed(8) : null;
    const tier = ret === null ? 1 : returnIntensity(ret, "day");
    // Scala condivisa delle mappe a intensità (heat-scale.ts, vetro --viz-*):
    // la tinta porta già il suo filo, quindi niente border-border qui sotto;
    // l'hover passa dal filo e non da una seconda velatura.
    return cn(heatTone(value.gt(0) ? "profit" : "loss", tier), "hover:border-foreground/40");
  }

  // Frecce, picker e «Oggi» restano sulla Dashboard: conservano periodo e
  // valuta già in URL e non riportano la pagina in cima.
  const monthHref = (target: string | null) =>
    calendarHref(target, { keep: params, currency: keptCurrency });

  return (
    <section
      id={CALENDAR_ANCHOR}
      aria-labelledby="calendario-titolo"
      className="scroll-mt-20"
    >
      <Card className="gap-4 py-4">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle id="calendario-titolo" className="stat-label">
              Calendario
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              <span className="flex flex-wrap items-center gap-1">
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
              </span>
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scope.multi && showCurrencyFilter ? (
              <CurrencyFilter
                currencies={currencyTotals.map((t) => t.currency)}
                active={currency}
              />
            ) : null}
            <Button asChild variant="outline" size="icon" aria-label="Mese precedente">
              <Link href={monthHref(addMonths(month, -1))} scroll={false}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            {/* F42 — month-picker: salto diretto senza frecce ±1 in serie */}
            <MonthPicker month={month} currency={keptCurrency} />
            <Button asChild variant="outline" size="icon" aria-label="Mese successivo">
              <Link href={monthHref(addMonths(month, 1))} scroll={false}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            {month !== currentMonth ? (
              <Button asChild variant="outline">
                <Link href={monthHref(null)} scroll={false}>
                  Oggi
                </Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>

        {/* Sotto sm le celle giorno hanno ~34px utili: padding, gap e colonna
            settimana ridotti + formato importi ultra-compatto (formatSignedShort).
            Da sm in su il layout è quello della vecchia pagina a sé. */}
        <CardContent className="px-2 sm:px-4">
          {/* Otto colonne UGUALI: la settimana ha la stessa misura di un giorno
              (prima era una colonna stretta da 3-4,5rem, più piccola delle celle). */}
          <div className="grid grid-cols-8 gap-0.5 sm:gap-1">
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
              const weekTrades = weekDaysWithData.reduce(
                (acc, d) => acc + byDay.get(d)!.trades,
                0,
              );
              return (
                <div key={week[0]} className="contents">
                  {week.map((date) => {
                    const inMonth = date.startsWith(month);
                    const data = byDay.get(date);
                    const dayNumber = Number(date.slice(8, 10));
                    const isToday = date === todayKey;

                    // Giorni del mese accanto: cella vuota. Il numero in
                    // grigio al 40% stava a 2,2:1 (scuro) e 1,7:1 (chiaro),
                    // sotto la soglia di 4,5:1 del sistema visivo.
                    if (!inMonth) {
                      return (
                        <div
                          key={date}
                          className="min-h-20 rounded-md border border-transparent"
                          aria-hidden
                        />
                      );
                    }

                    const tone = data ? dayTone(data.netPnl) : "border-border/60 hover:bg-accent";

                    return (
                      <Link
                        key={date}
                        href={withCurrencyParam(`/day/${date}`, keptCurrency)}
                        className={cn(
                          "flex min-h-20 flex-col gap-0.5 overflow-hidden rounded-md border px-0.5 py-1 transition-colors sm:p-1.5",
                          tone,
                          isToday && "ring-1 ring-primary",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-between text-xs",
                            data ? HEAT_TEXT_MUTED : "text-muted-foreground",
                          )}
                        >
                          <span>{dayNumber}</span>
                          {noteDays.has(date) ? (
                            <NotebookPen className="size-3" aria-label="Nota di giornata" />
                          ) : null}
                        </span>
                        {data ? (
                          <>
                            {/* F4 — testo NON colorato sulla cella tinta: il
                                colore lo porta il fondo, il segno il + o il −
                                del numero. I due token heat-* reggono 4,5:1
                                sulla tinta più forte in entrambi i temi
                                (theme-contrast.test.ts). */}
                            <span className={cn("text-2xs font-semibold tabular-nums sm:text-sm", HEAT_TEXT)}>
                              <span className="sm:hidden">
                                {formatSignedShort(data.netPnl)}
                              </span>
                              <span className="hidden sm:inline">
                                {formatSignedCompact(data.netPnl)}
                              </span>
                            </span>
                            <span className={cn("text-2xs", HEAT_TEXT_MUTED)}>
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
                  {/* La cella «Sett.» apre la vista Settimana (lunedì→domenica,
                      la stessa riga): stesso aspetto a riposo, filo al
                      passaggio come le celle giorno. */}
                  <Link
                    href={withCurrencyParam(`/week/${week[0]}`, keptCurrency)}
                    aria-label={`Apri la settimana dal ${Number(week[0].slice(8, 10))}/${Number(week[0].slice(5, 7))}${weekDaysWithData.length > 0 ? ` (${weekTrades} trade)` : ""}`}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-border/60 bg-muted/40 px-0.5 py-1 text-xs tabular-nums transition-colors hover:border-foreground/40 sm:p-1.5",
                      weekDaysWithData.length > 0
                        ? pnlColorClass(weekNet)
                        : "text-muted-foreground",
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
                          <span className="sm:hidden">{weekTrades}</span>
                          <span className="hidden sm:inline">
                            {weekTrades} trade
                          </span>
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Link>
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
    </section>
  );
}
