import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatDurationSec } from "@/lib/dates";
import { formatPrice } from "@/lib/instruments";
import {
  formatMoney,
  formatPercent,
  formatRMultiple,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import {
  planCompletionInfo,
  plannedRInfo,
  planVsOutcome,
  realizedPriceRInfo,
} from "@/lib/metrics";
import { MetricInfo } from "@/components/metric-info";
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
import { DeleteTradeButton } from "@/components/trades/delete-trade-button";
import { AttachmentsCard } from "@/components/attachments/attachments-card";

export const metadata: Metadata = { title: "Dettaglio trade" };

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { id } = await params;

  const [user, trade] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    }),
    prisma.trade.findFirst({
      where: { id, account: { userId } },
      include: {
        account: { select: { name: true, currency: true } },
        strategy: { select: { name: true, color: true } },
        executions: { orderBy: { executedAt: "asc" } },
        tags: { include: { tag: true } },
        notes: { where: { type: "TRADE" }, orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  if (!trade) notFound();

  // Prev/next nella cronologia dell'utente (stesso ordine della lista trade:
  // openedAt, con id come tie-break stabile). "Precedente" = aperto prima.
  // Gli allegati sono in una query dedicata: MAI includere `data` nei listing.
  const [prevTrade, nextTrade, attachments] = await Promise.all([
    prisma.trade.findFirst({
      where: {
        account: { userId },
        OR: [
          { openedAt: { lt: trade.openedAt } },
          { openedAt: trade.openedAt, id: { lt: trade.id } },
        ],
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      select: { id: true, symbol: true },
    }),
    prisma.trade.findFirst({
      where: {
        account: { userId },
        OR: [
          { openedAt: { gt: trade.openedAt } },
          { openedAt: trade.openedAt, id: { gt: trade.id } },
        ],
      },
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
      select: { id: true, symbol: true },
    }),
    prisma.attachment.findMany({
      where: { userId, tradeId: trade.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, fileName: true, mimeType: true, size: true },
    }),
  ]);

  const currency = trade.account.currency;

  // Durata dai timestamp (display only: qui il Number è solo tempo, non denaro).
  const durationSec = trade.closedAt
    ? String((trade.closedAt.getTime() - trade.openedAt.getTime()) / 1000)
    : null;

  // Piano vs esito (F16a): confronto sui prezzi, fee escluse.
  const plan = planVsOutcome({
    direction: trade.direction,
    entry: trade.avgEntryPrice.toString(),
    exit: trade.avgExitPrice ? trade.avgExitPrice.toString() : null,
    plannedStop: trade.plannedStop ? trade.plannedStop.toString() : null,
    plannedTarget: trade.plannedTarget ? trade.plannedTarget.toString() : null,
  });
  const hasPlanInput = trade.plannedStop !== null || trade.plannedTarget !== null;

  // Nota onesta sotto ai numeri: spiega PERCHÉ un valore è "—" invece di
  // lasciare il dubbio (dati insufficienti / piano non valido / trade aperto).
  let planNote: string | null = null;
  if (plan.stopSideInvalid || plan.targetSideInvalid) {
    planNote =
      "Stop o target pianificato dal lato sbagliato rispetto all'ingresso: il piano non è valido per il calcolo degli R.";
  } else if (trade.plannedStop === null) {
    planNote =
      "Senza stop pianificato il rischio non è definito: gli R non sono calcolabili.";
  } else if (trade.plannedTarget === null) {
    planNote =
      "Senza target pianificato l'R del piano non è calcolabile; l'esito sui prezzi sì.";
  } else if (trade.status === "OPEN") {
    planNote = "Trade ancora aperto: l'esito si misura alla chiusura.";
  }
  const infoRows: { label: string; value: React.ReactNode }[] = [
    { label: "Conto", value: trade.account.name },
    { label: "Asset class", value: trade.assetClass },
    { label: "Valore punto", value: trimZeros(trade.pointValue.toString()) },
    { label: "Quantità", value: trimZeros(trade.quantity.toString()) },
    {
      label: "Prezzo medio ingresso",
      value: formatPrice(trade.avgEntryPrice.toString(), trade.symbol, trade.assetClass),
    },
    {
      label: "Prezzo medio uscita",
      value: trade.avgExitPrice
        ? formatPrice(trade.avgExitPrice.toString(), trade.symbol, trade.assetClass)
        : "—",
    },
    { label: "Apertura", value: formatDateTime(trade.openedAt, user.timezone) },
    {
      label: "Chiusura",
      value: trade.closedAt ? formatDateTime(trade.closedAt, user.timezone) : "—",
    },
    { label: "Durata", value: formatDurationSec(durationSec) },
    { label: "P&L lordo", value: formatSignedMoney(trade.grossPnl.toString(), currency) },
    { label: "Fee totali", value: formatMoney(trade.fees.toString(), currency) },
    {
      label: "Rischio iniziale",
      value: trade.initialRisk ? formatMoney(trade.initialRisk.toString(), currency) : "—",
    },
    {
      label: "R-multiple",
      value: trade.rMultiple ? formatRMultiple(trade.rMultiple.toString()) : "—",
    },
    {
      label: "Stop pianificato",
      value: trade.plannedStop
        ? formatPrice(trade.plannedStop.toString(), trade.symbol, trade.assetClass)
        : "—",
    },
    {
      label: "Target pianificato",
      value: trade.plannedTarget
        ? formatPrice(trade.plannedTarget.toString(), trade.symbol, trade.assetClass)
        : "—",
    },
    { label: "Strategia", value: trade.strategy?.name ?? "—" },
    { label: "Valutazione", value: trade.rating ? "★".repeat(trade.rating) : "—" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Torna ai trade">
            <Link href="/trades">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">{trade.symbol}</h1>
              <Badge
                variant="outline"
                className={trade.direction === "LONG" ? "text-profit" : "text-loss"}
              >
                {trade.direction}
              </Badge>
              <Badge variant={trade.status === "OPEN" ? "default" : "secondary"}>
                {trade.status === "OPEN" ? "Aperto" : "Chiuso"}
              </Badge>
            </div>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                pnlColorClass(trade.netPnl.toString()),
              )}
            >
              {formatSignedMoney(trade.netPnl.toString(), currency)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">netto</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prevTrade ? (
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label={`Trade precedente (${prevTrade.symbol})`}
            >
              <Link href={`/trades/${prevTrade.id}`}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled aria-label="Nessun trade precedente">
              <ChevronLeft className="size-4" />
            </Button>
          )}
          {nextTrade ? (
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label={`Trade successivo (${nextTrade.symbol})`}
            >
              <Link href={`/trades/${nextTrade.id}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled aria-label="Nessun trade successivo">
              <ChevronRight className="size-4" />
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="max-sm:px-2.5">
            <Link href={`/trades/${trade.id}/edit`} aria-label="Modifica trade">
              <Pencil className="size-4" />
              <span className="max-sm:hidden">Modifica</span>
            </Link>
          </Button>
          <DeleteTradeButton tradeId={trade.id} symbol={trade.symbol} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riepilogo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {infoRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-medium tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
          {trade.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {trade.tags.map(({ tag }) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Piano vs esito</CardTitle>
          <div className="flex items-center gap-2">
            {plan.stopViolated ? (
              <Badge variant="outline" className="text-loss">
                Stop non rispettato
              </Badge>
            ) : null}
            {plan.targetExceeded ? (
              <Badge variant="outline" className="text-profit">
                Oltre il target
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {hasPlanInput ? (
            <>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="stat-label flex items-center gap-1">
                    R pianificato
                    <MetricInfo info={plannedRInfo} />
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {plan.plannedR ? formatRMultiple(plan.plannedR) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="stat-label flex items-center gap-1">
                    R realizzato (prezzo)
                    <MetricInfo info={realizedPriceRInfo} />
                  </dt>
                  <dd
                    className={cn(
                      "mt-1 text-lg font-semibold tabular-nums",
                      plan.realizedPriceR
                        ? pnlColorClass(plan.realizedPriceR)
                        : undefined,
                    )}
                  >
                    {plan.realizedPriceR ? formatRMultiple(plan.realizedPriceR) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="stat-label flex items-center gap-1">
                    Piano raggiunto
                    <MetricInfo info={planCompletionInfo} />
                  </dt>
                  <dd
                    className={cn(
                      "mt-1 text-lg font-semibold tabular-nums",
                      plan.planCompletion
                        ? pnlColorClass(plan.planCompletion)
                        : undefined,
                    )}
                  >
                    {plan.planCompletion !== null
                      ? formatPercent(plan.planCompletion)
                      : "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {planNote ?? "Calcolato sui prezzi medi di ingresso e uscita, fee escluse."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun piano registrato per questo trade: aggiungi stop e target
              pianificati (Modifica) per confrontare il piano con l&apos;esito.
            </p>
          )}
        </CardContent>
      </Card>

      <AttachmentsCard
        target={{ kind: "trade", tradeId: trade.id }}
        attachments={attachments}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Esecuzioni ({trade.executions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data e ora</TableHead>
                <TableHead>Lato</TableHead>
                <TableHead className="text-right">Quantità</TableHead>
                <TableHead className="text-right">Prezzo</TableHead>
                <TableHead className="text-right">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trade.executions.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(execution.executedAt, user.timezone)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={execution.side === "BUY" ? "text-profit" : "text-loss"}
                    >
                      {execution.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trimZeros(execution.quantity.toString())}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(execution.price.toString(), trade.symbol, trade.assetClass)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(execution.fee.toString(), currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {trade.notes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Note</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {trade.notes.map((note) => (
              <p key={note.id} className="whitespace-pre-wrap text-sm">
                {note.content}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
