"use client";

import Decimal from "decimal.js";
import {
  avgR,
  avgRInfo,
  avgWinLossR,
  avgWinLossRInfo,
  profitFactor,
  profitFactorInfo,
  winRate,
  winRateInfo,
  type RSplitAggregates,
} from "@/lib/metrics";
import {
  formatPercent,
  formatProfitFactor,
  formatRMultiple,
  formatRatio,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { MetricInfo } from "@/components/metric-info";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Riga generica: sessioni (lib/sessions) e giorni (lib/weekdays) combaciano. */
export interface PerformanceBarRow extends RSplitAggregates {
  label: string;
  total: number;
  wins: number;
  winSum: string;
  lossSum: string;
  netPnl: string;
  rSum: string;
  rCount: number;
}

/**
 * F22 — breakdown di performance come TABELLA compatta con barre
 * orizzontali: al posto dei 4 mini-radar (che con 2 assi strutturalmente
 * vuoti avevano sempre la stessa forma). Più densa, più onesta, meno pixel.
 * I profitti negativi restano negativi: barra rossa verso sinistra del
 * riferimento, mai appiattiti a zero. Generalizzata (era SessionTable) per
 * servire sia le sessioni sia i giorni della settimana con lo stesso stile.
 */
export function PerformanceBarTable({
  rows,
  rowHeader,
  currency,
  masked = false,
}: {
  rows: PerformanceBarRow[];
  rowHeader: string;
  currency: string;
  masked?: boolean;
}) {
  // Scala delle barre: il massimo |P&L| tra le righe con trade.
  const maxAbs = rows.reduce((acc, r) => {
    const abs = new Decimal(r.netPnl).abs();
    return abs.gt(acc) ? abs : acc;
  }, new Decimal(0));

  return (
    /* Sei colonne fisse + la barra: sotto ~46rem la tabella scorre in
       orizzontale invece di comprimere le celle numeriche (Fase 60). */
    <div className="overflow-x-auto">
      <Table className="min-w-[46rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{rowHeader}</TableHead>
            <TableHead className="text-right">Trade</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Win % <MetricInfo info={winRateInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Avg Win/Loss <MetricInfo info={avgWinLossRInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                PF <MetricInfo info={profitFactorInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Expectancy <MetricInfo info={avgRInfo} />
              </span>
            </TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead className="w-[20%] min-w-20"><span className="sr-only">Barra P&L</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const empty = row.total === 0;
            const rate = winRate(row.wins, row.total);
            const expectancyR = avgR(row.rSum, row.rCount);
            const winLoss = avgWinLossR(row);
            const pf = profitFactor(row.winSum, row.lossSum);
            const pct = maxAbs.isZero()
              ? 0
              : new Decimal(row.netPnl)
                  .abs()
                  .div(maxAbs)
                  .times(100)
                  .toDecimalPlaces(0)
                  .toNumber();
            const negative = new Decimal(row.netPnl).lt(0);
            return (
              <TableRow
                key={row.label}
                className={empty ? "text-muted-foreground/60" : undefined}
              >
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {empty ? "—" : row.total}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {empty ? "—" : formatPercent(rate, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRatio(winLoss)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {empty ? "—" : formatProfitFactor(pf, row.wins)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {expectancyR !== null ? formatRMultiple(expectancyR) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    empty || masked ? undefined : pnlColorClass(row.netPnl),
                  )}
                >
                  {empty
                    ? "—"
                    : masked
                      ? "•••"
                      : formatSignedMoney(row.netPnl, currency)}
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
