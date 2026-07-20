import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ArrowLeft, CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId, tradeAccountWhere } from "@/lib/active-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { addDays, isValidDateKey } from "@/lib/calendar";
import { dayNotesByPhase } from "@/lib/day-journal";
import { formatDateTime, zonedInputToUtc } from "@/lib/dates";
import {
  classifyOutcome,
  netPnlInfo,
  streakSummary,
  streaksInfo,
  winRate,
  winRateInfo,
} from "@/lib/metrics";
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
  formatSignedMoney,
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
import { DayNoteEditor } from "./day-note-editor";

export const metadata: Metadata = { title: "Day View" };

function dayLabel(date: string): string {
  // Mezzogiorno UTC + timeZone UTC: la label non può scivolare di giorno.
  const label = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function DayViewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { date } = await params;
  if (!isValidDateKey(date)) notFound();

  const [user, activeAccountId] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, baseCurrency: true },
    }),
    getActiveAccountId(),
  ]);

  // Il "giorno" è quello di calendario nel fuso utente: stessi confini e
  // stessa convenzione (closedAt) del bucketing SQL del calendario.
  const start = zonedInputToUtc(`${date}T00:00`, user.timezone);
  const end = zonedInputToUtc(`${addDays(date, 1)}T00:00`, user.timezone);

  const accountWhere = tradeAccountWhere(userId, activeAccountId);

  const [trades, dayNotes, activeAccount] = await Promise.all([
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
    prisma.note.findMany({
      where: {
        userId,
        type: "DAILY",
        dayDate: new Date(`${date}T00:00:00.000Z`),
      },
      select: { dayPhase: true, content: true },
    }),
    activeAccountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({
          where: { id: activeAccountId, userId },
          select: { currency: true },
        }),
  ]);

  const currency = activeAccount?.currency ?? user.baseCurrency;

  // Poche righe, già caricate per la tabella: le somme restano Decimal.
  // Il cumulato per il grafico intraday è solo presentazione, costruito
  // nello stesso passaggio (trade in ordine di closedAt asc, come la query).
  const timeFormat = new Intl.DateTimeFormat("it-IT", {
    timeZone: user.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const intradayPoints: IntradayPoint[] = [];
  let net = new Decimal(0);
  let fees = new Decimal(0);
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  for (const trade of trades) {
    const pnl = new Decimal(trade.netPnl.toString());
    net = net.plus(pnl);
    fees = fees.plus(trade.fees.toString());
    if (pnl.gt(0)) wins += 1;
    else if (pnl.lt(0)) losses += 1;
    else breakevens += 1;
    intradayPoints.push({
      time: trade.closedAt ? timeFormat.format(trade.closedAt) : "—",
      symbol: trade.symbol,
      cumulative: net.toFixed(2),
    });
  }
  const dayWinRate = winRate(wins, trades.length);
  const dayRuns = streakSummary(
    trades.map((t) => classifyOutcome(t.netPnl.toString())),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Torna al calendario">
            <Link href={`/day?month=${date.slice(0, 7)}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="page-title">{dayLabel(date)}</h1>
            <p className="page-subtitle">
              {trades.length === 0
                ? "Nessun trade chiuso in questa giornata"
                : `${trades.length} trade chiusi · ${wins} W · ${losses} L${breakevens > 0 ? ` · ${breakevens} BE` : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Giorno precedente">
            <Link href={`/day/${addDays(date, -1)}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Giorno successivo">
            <Link href={`/day/${addDays(date, 1)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="stat-label flex items-center gap-1">
              Net P&L
              <MetricInfo info={netPnlInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p
              className={cn("stat-value-hero", pnlColorClass(net.toFixed(2)))}
            >
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
              Win rate di giornata
              <MetricInfo info={winRateInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="stat-value">{formatPercent(dayWinRate)}</p>
            <p className="stat-sub mt-1">{trades.length} trade chiusi</p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="stat-label">Conto</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="stat-value truncate">
              {activeAccountId === ALL_ACCOUNTS ? "Tutti i conti" : trades[0]?.account.name ?? "—"}
            </p>
            <p className="stat-sub mt-1">Valuta {currency}</p>
          </CardContent>
        </Card>
      </div>

      {trades.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="stat-label">
                P&L cumulativo intraday
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IntradayPnlChart
                points={intradayPoints}
                suffix={` ${currency}`}
              />
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
                  <span className="font-semibold text-profit">
                    {dayRuns.maxWin}
                  </span>
                </span>
                <span>
                  Max Loss Streak{" "}
                  <span className="font-semibold text-loss">
                    {dayRuns.maxLoss}
                  </span>
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <TradeSequenceChart
                points={intradayPoints.map((p, i) => ({
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
          <CardTitle className="text-base">Trade della giornata</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <EmptyState
              compact
              icon={CalendarOff}
              title="Nessun trade chiuso in questa giornata"
              description="I giorni seguono il tuo fuso orario: un trade chiuso dopo mezzanotte appartiene al giorno successivo."
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
                          className={
                            trade.direction === "LONG" ? "text-profit" : "text-loss"
                          }
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
                        {formatSignedMoney(
                          trade.netPnl.toString(),
                          trade.account.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {trade.rMultiple
                          ? formatRMultiple(trade.rMultiple.toString())
                          : "—"}
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
          <CardTitle className="text-base">Journal di giornata</CardTitle>
        </CardHeader>
        <CardContent>
          <DayNoteEditor date={date} initialByPhase={dayNotesByPhase(dayNotes)} />
        </CardContent>
      </Card>
    </div>
  );
}
