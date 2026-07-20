import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, formatRMultiple, formatSignedMoney, pnlColorClass } from "@/lib/money";
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

  const currency = trade.account.currency;
  const infoRows: { label: string; value: React.ReactNode }[] = [
    { label: "Conto", value: trade.account.name },
    { label: "Asset class", value: trade.assetClass },
    { label: "Valore punto", value: trimZeros(trade.pointValue.toString()) },
    { label: "Quantità", value: trimZeros(trade.quantity.toString()) },
    { label: "Prezzo medio ingresso", value: trimZeros(trade.avgEntryPrice.toString()) },
    {
      label: "Prezzo medio uscita",
      value: trade.avgExitPrice ? trimZeros(trade.avgExitPrice.toString()) : "—",
    },
    { label: "Apertura", value: formatDateTime(trade.openedAt, user.timezone) },
    {
      label: "Chiusura",
      value: trade.closedAt ? formatDateTime(trade.closedAt, user.timezone) : "—",
    },
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
      value: trade.plannedStop ? trimZeros(trade.plannedStop.toString()) : "—",
    },
    {
      label: "Target pianificato",
      value: trade.plannedTarget ? trimZeros(trade.plannedTarget.toString()) : "—",
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
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/trades/${trade.id}/edit`}>
              <Pencil className="size-4" />
              Modifica
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
                    {trimZeros(execution.price.toString())}
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
