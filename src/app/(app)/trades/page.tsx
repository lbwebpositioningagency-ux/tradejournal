import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileUp, Plus, Table2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId, tradeAccountWhere } from "@/lib/active-account";
import { formatDateTime } from "@/lib/dates";
import { formatPrice } from "@/lib/instruments";
import { formatRMultiple, formatSignedMoney, pnlColorClass } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import {
  buildTradeFilterWhere,
  countActiveFilters,
  parseTradeFilters,
} from "@/lib/trade-filters";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TradeFiltersBar } from "@/components/trades/trade-filters-bar";
import { EmptyState } from "@/components/empty-state";
import { classifyOutcome, streakSummary, streaksInfo } from "@/lib/metrics";
import { MetricInfo } from "@/components/metric-info";
import { TradeSequenceChart } from "@/components/charts/trade-sequence-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Trade View" };

const PAGE_SIZE = 25;

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const params = await searchParams;
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : 1) || 1);

  const [user, activeAccountId] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, baseCurrency: true },
    }),
    getActiveAccountId(),
  ]);

  const filters = parseTradeFilters(params);
  const activeCount = countActiveFilters(filters);
  const period = resolvePeriod(params, user.timezone);
  const hasAnyFilter = activeCount > 0 || period.key !== "all";

  // Il filtro account/userId resta SEMPRE la base del where.
  const where = {
    ...tradeAccountWhere(userId, activeAccountId),
    ...buildTradeFilterWhere(filters, period),
  };

  const [trades, total, strategies, tags, closedSequenceDesc, activeAccount] =
    await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { openedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          account: { select: { name: true, currency: true } },
          strategy: { select: { name: true } },
        },
      }),
      prisma.trade.count({ where }),
      prisma.strategy.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.tag.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      // Sequenza per il grafico "candele": STESSI filtri della tabella,
      // solo i chiusi, ultimi 200, tre colonne — mai la lista completa.
      prisma.trade.findMany({
        where: { ...where, status: "CLOSED", closedAt: { not: null } },
        orderBy: [{ closedAt: "desc" }, { id: "desc" }],
        take: 200,
        select: { netPnl: true, symbol: true, closedAt: true },
      }),
      activeAccountId !== "all"
        ? prisma.tradingAccount.findFirst({
            where: { id: activeAccountId, userId },
            select: { currency: true },
          })
        : null,
    ]);

  const closedSequence = [...closedSequenceDesc].reverse();
  const sequencePoints = closedSequence.map((t) => ({
    label: formatDateTime(t.closedAt!, user.timezone),
    symbol: t.symbol,
    netPnl: t.netPnl.toString(),
  }));
  const runs = streakSummary(
    sequencePoints.map((p) => classifyOutcome(p.netPnl)),
  );
  const sequenceCurrency = activeAccount?.currency ?? user.baseCurrency;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Link di paginazione che preserva filtri e periodo. */
  function pageHref(target: number): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "page") query.set(key, value);
    }
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `/trades?${qs}` : "/trades";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Trade View</h1>
          <p className="page-subtitle">
            {total} trade{activeAccountId !== "all" ? " nel conto selezionato" : ""}
            {hasAnyFilter ? ` · ${period.label}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/import">
              <FileUp className="size-4" />
              Importa CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/trades/new">
              <Plus className="size-4" />
              Nuovo trade
            </Link>
          </Button>
        </div>
      </div>

      <TradeFiltersBar
        filters={filters}
        activeCount={activeCount}
        period={{
          key: period.key,
          label: period.label,
          fromKey: period.fromKey,
          toKey: period.toKey,
        }}
        strategies={strategies}
        tags={tags}
      />

      {sequencePoints.length > 1 ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="stat-label flex items-center gap-1">
              Sequenza trade (filtri attivi)
              <MetricInfo info={streaksInfo} />
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Max Win Streak{" "}
                <span className="font-semibold text-profit">{runs.maxWin}</span>
              </span>
              <span>
                Max Loss Streak{" "}
                <span className="font-semibold text-loss">{runs.maxLoss}</span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <TradeSequenceChart
              points={sequencePoints}
              suffix={` ${sequenceCurrency}`}
            />
            {closedSequenceDesc.length === 200 ? (
              <p className="stat-sub mt-1">Ultimi 200 trade chiusi coi filtri attivi</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {trades.length === 0 ? (
        hasAnyFilter ? (
          <EmptyState
            icon={Table2}
            title="Nessun trade corrisponde ai filtri"
            description="Prova ad allargare il periodo o a rimuovere qualche filtro."
          >
            <Button asChild variant="outline">
              <Link href="/trades">Azzera filtri</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Table2}
            title="Nessun trade ancora"
            description="Aggiungine uno a mano oppure importa lo storico dal tuo broker in CSV."
          >
            <Button asChild variant="outline">
              <Link href="/trades/new">Aggiungi il primo trade</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          {/* Mobile (< md): card impilate — Net P&L e R SEMPRE in vista senza
              scroll orizzontale (stessi dati della tabella, priorità riordinata).
              Stile in linea col widget "Ultimi trade" della dashboard. */}
          <div className="flex flex-col gap-2 md:hidden">
            {trades.map((trade) => (
              <Link
                key={trade.id}
                href={`/trades/${trade.id}`}
                data-testid="trade-card"
                className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-card transition-colors hover:bg-accent/50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{trade.symbol}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        trade.direction === "LONG" ? "text-profit" : "text-loss",
                      )}
                    >
                      {trade.direction}
                    </Badge>
                    {trade.status === "OPEN" ? <Badge>Aperto</Badge> : null}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        pnlColorClass(trade.netPnl.toString()),
                      )}
                    >
                      {formatSignedMoney(
                        trade.netPnl.toString(),
                        trade.account.currency,
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {trade.rMultiple
                        ? formatRMultiple(trade.rMultiple.toString())
                        : "—"}
                    </span>
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">
                    {formatDateTime(trade.openedAt, user.timezone)}
                  </span>
                  <span className="truncate tabular-nums">
                    {trimZeros(trade.quantity.toString())} ·{" "}
                    {formatPrice(
                      trade.avgEntryPrice.toString(),
                      trade.symbol,
                      trade.assetClass,
                    )}
                    {trade.avgExitPrice
                      ? ` → ${formatPrice(trade.avgExitPrice.toString(), trade.symbol, trade.assetClass)}`
                      : ""}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                  <span className="truncate">{trade.strategy?.name ?? "—"}</span>
                  <span className="truncate">{trade.account.name}</span>
                </span>
              </Link>
            ))}
          </div>

          {/* Desktop (≥ md): tabella completa, invariata */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Simbolo</TableHead>
                  <TableHead>Direzione</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                  <TableHead className="text-right">R</TableHead>
                  <TableHead>Stato</TableHead>
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
                      {formatDateTime(trade.openedAt, user.timezone)}
                    </TableCell>
                    <TableCell className="font-medium">{trade.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          trade.direction === "LONG" ? "text-profit" : "text-loss",
                        )}
                      >
                        {trade.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {trimZeros(trade.quantity.toString())}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(trade.avgEntryPrice.toString(), trade.symbol, trade.assetClass)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {trade.avgExitPrice
                        ? formatPrice(trade.avgExitPrice.toString(), trade.symbol, trade.assetClass)
                        : "—"}
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
                    <TableCell>
                      <Badge variant={trade.status === "OPEN" ? "default" : "secondary"}>
                        {trade.status === "OPEN" ? "Aperto" : "Chiuso"}
                      </Badge>
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

          {totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">
                Pagina {page} di {totalPages}
              </span>
              <Button asChild variant="outline" size="icon" disabled={page <= 1}>
                <Link href={pageHref(page - 1)} aria-label="Pagina precedente">
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="icon" disabled={page >= totalPages}>
                <Link href={pageHref(page + 1)} aria-label="Pagina successiva">
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** "2.00000000" → "2" · "0.50000000" → "0.5" (solo display). */
function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
