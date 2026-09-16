import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { ALL_ACCOUNTS, DAY_VIEW_PAGE_SIZE } from "@/lib/constants";
import { getCurrencyBreakdown, getDailyPnl, getPeriodPnl } from "@/lib/queries/stats";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { withCurrencyParam } from "@/lib/currency-nav";
import { reportRangeLabel } from "@/lib/report-period";
import {
  buildDayViewRows,
  dayViewDayLabel,
  isDayViewMode,
  weekPageHref,
  type DayViewMode,
} from "@/lib/day-view";
import { formatSignedMoney, pnlColorClass } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedNav } from "@/components/ui/segmented";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";

export const metadata: Metadata = { title: "Day View" };

/**
 * DAY VIEW — i giorni (o le settimane) del journal in ordine cronologico, dal
 * più recente (tavola Claude Design «Journal - Notebook e Day View,
 * disposizione», riquadro 2).
 *
 * Nessun calcolo nuovo: il Net P&L viene da `getDailyPnl` e dalla serie
 * settimanale di `getPeriodPnl`, gli stessi numeri del calendario e dei
 * report; i giorni con journal dalle note DAILY, con la stessa regola
 * dell'icona del calendario (esiste la nota del giorno). Conto dal selettore
 * in testata dell'app, valuta da `?cur` come nel resto del journal: mai due
 * valute sommate.
 */
export default async function DayViewListPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; cur?: string; page?: string }>;
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
  const userId = tradeScope.userId;
  const activeAccountId = tradeScope.accountId;
  const mode: DayViewMode = isDayViewMode(params.modo) ? params.modo : "day";
  const curParam = typeof params.cur === "string" && params.cur ? params.cur : undefined;

  const baseFilter = { userId, accountId: activeAccountId };
  const [currencyTotals, activeAccount, noteDays] = await Promise.all([
    getCurrencyBreakdown(baseFilter),
    activeAccountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({
          where: { id: activeAccountId, userId },
          select: { currency: true },
        }),
    prisma.note.findMany({
      // Il journal è PERSONALE: resta dell'utente vero anche in scope demo.
      where: { userId: sessionUserId, type: "DAILY", dayDate: { not: null } },
      distinct: ["dayDate"],
      select: { dayDate: true },
    }),
  ]);
  const scope = resolveCurrencyScope(currencyTotals, curParam);
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;
  const keptCurrency = scope.multi ? scope.active : undefined;
  const filter = { ...baseFilter, currency: scope.active };

  const pnl =
    mode === "day"
      ? (await getDailyPnl(filter, user.timezone)).map((d) => ({
          key: d.day,
          netPnl: d.netPnl,
          trades: d.trades,
        }))
      : (await getPeriodPnl(filter, user.timezone, "week")).map((w) => ({
          key: w.periodStart,
          netPnl: w.netPnl,
          trades: w.trades,
        }));
  const journalKeys = noteDays
    .map((n) => n.dayDate?.toISOString().slice(0, 10))
    .filter((k): k is string => Boolean(k));

  const rows = buildDayViewRows(mode, pnl, journalKeys);
  const totalPages = Math.max(1, Math.ceil(rows.length / DAY_VIEW_PAGE_SIZE));
  const page = parsePage(params.page, totalPages);
  const visible = rows.slice((page - 1) * DAY_VIEW_PAGE_SIZE, page * DAY_VIEW_PAGE_SIZE);

  const hrefFor = (next: { modo?: DayViewMode; page?: number }) => {
    const sp = new URLSearchParams();
    const nextMode = next.modo ?? mode;
    if (nextMode !== "day") sp.set("modo", nextMode);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const q = sp.toString();
    return withCurrencyParam(q ? `/day-view?${q}` : "/day-view", keptCurrency);
  };

  const unit = mode === "day" ? "giorni" : "settimane";
  const weekLinked = mode === "week" && rows.length > 0 && weekPageHref(rows[0].key) !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="Day View"
        description={
          rows.length === 0
            ? "Il journal in ordine cronologico, dal più recente"
            : `${rows.length} ${unit} con trade o journal${scope.multi ? ` · solo ${currency}` : ""}`
        }
        actions={
          <>
            <SegmentedNav
              label="Raggruppamento"
              items={[
                { key: "day", href: hrefFor({ modo: "day" }), label: "Day", active: mode === "day" },
                { key: "week", href: hrefFor({ modo: "week" }), label: "Week", active: mode === "week" },
              ]}
            />
            {scope.multi ? (
              <CurrencyFilter currencies={currencyTotals.map((t) => t.currency)} active={currency} />
            ) : null}
          </>
        }
      />

      {mode === "week" && rows.length > 0 && !weekLinked ? (
        <p className="text-sm text-muted-foreground">
          La pagina Settimana del journal non è ancora pubblicata: il collegamento da ogni
          settimana comparirà qui quando esisterà.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={mode === "day" ? "Nessun giorno da mostrare" : "Nessuna settimana da mostrare"}
          description="Compaiono qui i giorni con almeno un trade chiuso o una nota di giornata, dal più recente. I giorni seguono il tuo fuso orario."
        />
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {visible.map((row) => {
              const title =
                mode === "day" ? dayViewDayLabel(row.key) : `Settimana ${reportRangeLabel(row.key, "settimana")}`;
              const tradesText =
                row.trades === 0 ? "Nessun trade" : `${row.trades} trade`;
              const journalText =
                row.journalDays === 0
                  ? null
                  : mode === "day"
                    ? "journal scritto"
                    : `journal in ${row.journalDays} ${row.journalDays === 1 ? "giorno" : "giorni"}`;
              const href =
                mode === "day"
                  ? withCurrencyParam(`/day/${row.key}`, keptCurrency)
                  : ((weekHref) => (weekHref ? withCurrencyParam(weekHref, keptCurrency) : null))(weekPageHref(row.key));
              return (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5"
                >
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-muted-foreground">
                      {tradesText}
                      {journalText ? ` · ${journalText}` : ""}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "ml-auto text-right font-semibold tabular-nums sm:ml-0",
                      row.netPnl === null ? "text-muted-foreground" : pnlColorClass(row.netPnl),
                    )}
                  >
                    {row.netPnl === null ? (
                      <span aria-label="Nessun P&L">—</span>
                    ) : (
                      formatSignedMoney(row.netPnl, currency)
                    )}
                  </p>
                  {href ? (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={href}
                        aria-label={
                          mode === "day" ? `Vedi nota di ${title.toLowerCase()}` : `Vedi ${title.toLowerCase()}`
                        }
                      >
                        {mode === "day" ? "Vedi nota" : "Vedi settimana"}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={(n) => hrefFor({ page: n })} />
    </div>
  );
}
