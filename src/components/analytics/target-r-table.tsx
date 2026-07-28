import { cn } from "@/lib/utils";
import { formatPercent, formatRMultiple } from "@/lib/money";
import { MetricInfo } from "@/components/metric-info";
import {
  expectancyRInfo,
  hitRateInfo,
  targetRInfo,
  type TargetRBucketStats,
} from "@/lib/metrics/return-distribution";

/**
 * §3 — distribuzione dell'R realizzato per bucket di target R.
 *
 * Invece di un box plot Recharts (una libreria in più per un grafico che qui
 * ha quattro categorie) ogni riga porta il proprio **box plot in HTML**:
 * baffi min-max, scatola p25-p75, tacca sulla mediana e riferimento a 0R.
 * Su un asse condiviso da tutte le righe si legge a colpo d'occhio dove si
 * sposta la distribuzione al crescere del target.
 */

function BoxPlot({
  row,
  min,
  max,
}: {
  row: TargetRBucketStats;
  min: number;
  max: number;
}) {
  if (row.trades === 0 || row.p25 === null || row.p75 === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const span = max - min || 1;
  const pos = (v: number) => ((v - min) / span) * 100;

  const lo = Number(row.minR);
  const hi = Number(row.maxR);
  const q1 = Number(row.p25);
  const q3 = Number(row.p75);
  const median = Number(row.p50);

  return (
    <div className="relative h-6 w-full min-w-32" aria-hidden>
      {/* Riferimento break-even: sinistra perdita, destra profitto. */}
      <div
        className="absolute inset-y-0 w-px bg-border"
        style={{ left: `${pos(0)}%` }}
      />
      {/* Baffi min-max */}
      <div
        className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/50"
        style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }}
      />
      {/* Scatola interquartile */}
      <div
        className={cn(
          "absolute top-1/2 h-3.5 -translate-y-1/2 rounded-sm",
          median >= 0 ? "bg-profit/30" : "bg-loss/30",
        )}
        style={{ left: `${pos(q1)}%`, width: `${Math.max(0.6, pos(q3) - pos(q1))}%` }}
      />
      {/* Mediana */}
      <div
        className={cn(
          "absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2",
          median >= 0 ? "bg-profit" : "bg-loss",
        )}
        style={{ left: `${pos(median)}%` }}
      />
    </div>
  );
}

export function TargetRTable({ rows }: { rows: TargetRBucketStats[] }) {
  const values = rows
    .flatMap((r) => [r.minR, r.maxR])
    .filter((v): v is string => v !== null)
    .map(Number);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);

  return (
    <>
      {/* Desktop: tabella completa col box plot condiviso. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  Target R <MetricInfo info={targetRInfo} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-medium">Trade</th>
              <th className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Hit rate <MetricInfo info={hitRateInfo} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Expectancy <MetricInfo info={expectancyRInfo} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-medium">Mediana</th>
              <th className="py-2 font-medium">
                Distribuzione dell&apos;R realizzato
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{row.label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.trades > 0 ? (
                    <>
                      {row.trades}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({row.hits} al target)
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.hitRate !== null ? (
                    formatPercent(row.hitRate)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right font-medium tabular-nums",
                    row.expectancyR !== null &&
                      (Number(row.expectancyR) > 0
                        ? "text-profit"
                        : Number(row.expectancyR) < 0
                          ? "text-loss"
                          : "text-breakeven"),
                  )}
                >
                  {row.expectancyR !== null ? (
                    formatRMultiple(row.expectancyR)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                  {row.p50 !== null ? formatRMultiple(row.p50) : "—"}
                </td>
                <td className="py-2">
                  <BoxPlot row={row} min={min} max={max} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile (< md): card impilate, expectancy sempre in vista (F27). */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.bucket} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{row.label}</span>
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  row.expectancyR !== null &&
                    (Number(row.expectancyR) > 0
                      ? "text-profit"
                      : Number(row.expectancyR) < 0
                        ? "text-loss"
                        : "text-breakeven"),
                )}
              >
                {row.expectancyR !== null
                  ? formatRMultiple(row.expectancyR)
                  : "—"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
              <span>{row.trades} trade</span>
              <span>
                Hit {row.hitRate !== null ? formatPercent(row.hitRate) : "—"}
              </span>
              <span>
                Mediana {row.p50 !== null ? formatRMultiple(row.p50) : "—"}
              </span>
            </div>
            <div className="mt-2">
              <BoxPlot row={row} min={min} max={max} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
