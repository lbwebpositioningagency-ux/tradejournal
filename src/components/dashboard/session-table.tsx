"use client";

import Decimal from "decimal.js";
import { winRate } from "@/lib/metrics";
import {
  formatPercent,
  formatRMultiple,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import type { SessionPoint } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * F22 — performance per sessione come TABELLA compatta con barre
 * orizzontali: al posto dei 4 mini-radar (che con 2 assi strutturalmente
 * vuoti avevano sempre la stessa forma). Più densa, più onesta, meno pixel.
 * I profitti negativi restano negativi: barra rossa verso sinistra del
 * riferimento, mai appiattiti a zero.
 */
export function SessionTable({
  sessions,
  currency,
  masked = false,
}: {
  sessions: SessionPoint[];
  currency: string;
  masked?: boolean;
}) {
  // Scala delle barre: il massimo |P&L| tra le sessioni con trade.
  const maxAbs = sessions.reduce((acc, s) => {
    const abs = new Decimal(s.netPnl).abs();
    return abs.gt(acc) ? abs : acc;
  }, new Decimal(0));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sessione</TableHead>
            <TableHead className="text-right">Trade</TableHead>
            <TableHead className="text-right">Win %</TableHead>
            <TableHead className="text-right">R medio</TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead className="w-[30%] min-w-28"><span className="sr-only">Barra P&L</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const empty = session.total === 0;
            const rate = winRate(session.wins, session.total);
            const avgR =
              session.rCount > 0
                ? new Decimal(session.rSum).div(session.rCount).toFixed(4)
                : null;
            const pct = maxAbs.isZero()
              ? 0
              : new Decimal(session.netPnl)
                  .abs()
                  .div(maxAbs)
                  .times(100)
                  .toDecimalPlaces(0)
                  .toNumber();
            const negative = new Decimal(session.netPnl).lt(0);
            return (
              <TableRow
                key={session.session}
                className={empty ? "text-muted-foreground/60" : undefined}
              >
                <TableCell className="font-medium">{session.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {empty ? "—" : session.total}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {empty ? "—" : formatPercent(rate, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {avgR !== null ? formatRMultiple(avgR) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    empty || masked ? undefined : pnlColorClass(session.netPnl),
                  )}
                >
                  {empty
                    ? "—"
                    : masked
                      ? "•••"
                      : formatSignedMoney(session.netPnl, currency)}
                </TableCell>
                <TableCell>
                  {!empty ? (
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          negative ? "bg-loss" : "bg-profit",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
