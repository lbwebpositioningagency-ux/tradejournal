import { formatPercent, formatSignedMoney, pnlColorClass } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BenchmarkRow } from "@/lib/metrics";

/**
 * Confronto per simbolo fra il realizzato e il buy & hold.
 *
 * Le righe NON coperte restano in tabella invece di sparire: un simbolo che
 * scompare si legge come "non l'ho tradato", mentre la verità è "non ho la
 * serie per confrontarlo". Il P&L dell'utente si mostra comunque, perché
 * quello lo si conosce.
 */
export function BenchmarkTable({
  rows,
  currency,
}: {
  rows: BenchmarkRow[];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Simbolo</TableHead>
          <TableHead className="text-right">Trade</TableHead>
          <TableHead className="text-right">Il tuo P&amp;L</TableHead>
          <TableHead className="text-right">Strumento nel periodo</TableHead>
          <TableHead className="text-right">Buy &amp; hold della tua size</TableHead>
          <TableHead className="text-right">Esito</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.symbol}>
            <TableCell className="font-medium">
              {row.symbol}
              {row.instrument && row.instrument !== row.symbol ? (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  vs {row.instrument}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.trades}</TableCell>
            <TableCell
              className={cn(
                "text-right font-medium tabular-nums",
                pnlColorClass(row.netPnl),
              )}
            >
              {formatSignedMoney(row.netPnl, currency)}
            </TableCell>
            {row.covered ? (
              <>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    pnlColorClass(row.changePct!),
                  )}
                >
                  {Number(row.changePct) >= 0 ? "+" : ""}
                  {formatPercent(row.changePct!)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    pnlColorClass(row.buyHold!),
                  )}
                >
                  {formatSignedMoney(row.buyHold!, currency)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={row.beatsBuyHold ? "text-profit" : "text-loss"}
                  >
                    {row.beatsBuyHold ? "hai battuto" : "meglio fermo"}
                  </Badge>
                </TableCell>
              </>
            ) : (
              <TableCell
                colSpan={3}
                className="text-right text-xs text-muted-foreground"
              >
                Serie di chiusure non disponibile per questo simbolo
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
