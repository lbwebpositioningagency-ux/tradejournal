import { MetricInfo } from "@/components/metric-info";
import { formatNumber } from "@/lib/format-number";
import { avgStreakInfo, type StreakSummary } from "@/lib/metrics/streaks";
import { cn } from "@/lib/utils";

/**
 * Streak nella testata dei grafici a barre (P&L giornaliero, Sequenza trade):
 * una riga per segno, massimo e media. Le due cifre non devono potersi
 * scambiare: il massimo è un numero nudo, la media porta sempre il decimale,
 * l'unità e «di fila» — è la lunghezza tipica di una serie, non un record
 * (tavola CD «Dashboard - P&L giornaliero e cumulativo a finestra», 1b).
 *
 * `scope` è la riga che dice SU COSA sono calcolate («Streak degli ultimi 50
 * trade»): obbligatoria quando le streak seguono la finestra visibile e non
 * il periodo (tavola «Grafici temporali - solo preset…», 1a).
 */
export function StreakLegend({
  runs,
  unit,
  winLabel,
  lossLabel,
  scope,
}: {
  runs: StreakSummary;
  unit: "giorni" | "trade";
  winLabel: string;
  lossLabel: string;
  scope?: string;
}) {
  const rows = [
    { label: winLabel, max: runs.maxWin, avg: runs.avgWin, tone: "text-profit" },
    { label: lossLabel, max: runs.maxLoss, avg: runs.avgLoss, tone: "text-loss" },
  ];
  return (
    <div className="flex flex-col gap-0.5 text-xs tabular-nums text-muted-foreground">
      {scope ? (
        <p aria-live="polite" className="font-medium">
          {scope}
        </p>
      ) : null}
      {rows.map((row) => (
        <p key={row.label} className="flex flex-wrap items-center gap-x-1.5">
          <span>
            {row.label}{" "}
            <span className={cn("font-semibold", row.tone)}>{row.max}</span>
          </span>
          <span aria-hidden>·</span>
          <span>
            Media{" "}
            {/* Sempre un decimale («2,0», non «2»): è il segno che distingue
                la media dal massimo, che è un intero. Number solo per il display. */}
            <span className={cn("font-semibold", row.tone)}>
              {row.avg !== null ? formatNumber(Number(row.avg), { decimals: 1 }) : "—"}
            </span>
            {row.avg !== null ? ` ${unit} di fila` : ""}
          </span>
          <MetricInfo info={avgStreakInfo} size="sm" />
        </p>
      ))}
    </div>
  );
}
