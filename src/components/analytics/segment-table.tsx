import { cn } from "@/lib/utils";
import {
  formatPercent,
  formatProfitFactor,
  formatRMultiple,
  formatRatio,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import {
  avgRInfo,
  avgWinLossRInfo,
  profitFactorInfo,
  winRateInfo,
  type SegmentMetrics,
} from "@/lib/metrics";
import { MetricInfo } from "@/components/metric-info";

/**
 * Tabella di dettaglio di un segmento (fascia oraria o durata).
 *
 * Regole di lettura applicate qui:
 * - le righe con **campione ridotto** sono attenuate e portano l'etichetta,
 *   così il numero non viene letto con la stessa fiducia di una riga piena;
 * - un segmento **senza trade** mostra trattini, non zeri: zero P&L su zero
 *   trade non è un risultato;
 * - su mobile la tabella diventa card impilate con la metrica principale
 *   sempre in vista (stessa scelta di Reports e Analytics).
 */

type Row = SegmentMetrics & { label: string };

function Cells({ row, currency }: { row: Row; currency: string }) {
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <>
      <td className="py-2 pr-3 text-right tabular-nums">
        {row.empty ? dash : row.total}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {row.winRate !== null ? formatPercent(row.winRate) : dash}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {row.avgWinLoss !== null ? formatRatio(row.avgWinLoss) : dash}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {row.empty ? dash : formatProfitFactor(row.profitFactor, row.wins)}
      </td>
      <td
        className={cn(
          "py-2 pr-3 text-right font-medium tabular-nums",
          row.avgR !== null && pnlColorClass(row.avgR),
        )}
      >
        {row.avgR !== null ? formatRMultiple(row.avgR) : dash}
      </td>
      <td
        className={cn(
          "py-2 text-right font-medium tabular-nums",
          !row.empty && pnlColorClass(row.netPnl),
        )}
      >
        {row.empty ? dash : formatSignedMoney(row.netPnl, currency)}
      </td>
    </>
  );
}

export function SegmentTable({
  rows,
  currency,
  segmentLabel,
}: {
  rows: Row[];
  currency: string;
  segmentLabel: string;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{segmentLabel}</th>
              <th className="py-2 pr-3 text-right font-medium">Trade</th>
              <th className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Win % <MetricInfo info={winRateInfo} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Avg Win/Loss <MetricInfo info={avgWinLossRInfo} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  PF <MetricInfo info={profitFactorInfo} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Expectancy <MetricInfo info={avgRInfo} />
                </span>
              </th>
              <th className="py-2 text-right font-medium">P&amp;L totale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className={cn(
                  "border-b last:border-0",
                  row.empty && "text-muted-foreground",
                  row.smallSample && "opacity-60",
                )}
              >
                <td className="whitespace-nowrap py-2 pr-3 font-medium">
                  {row.label}
                  {row.smallSample && (
                    <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-2xs font-normal text-muted-foreground">
                      campione ridotto
                    </span>
                  )}
                </td>
                <Cells row={row} currency={currency} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows
          .filter((row) => !row.empty)
          .map((row) => (
            <li
              key={row.label}
              className={cn("rounded-lg border p-3", row.smallSample && "opacity-60")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{row.label}</span>
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    pnlColorClass(row.netPnl),
                  )}
                >
                  {formatSignedMoney(row.netPnl, currency)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
                <span>{row.total} trade</span>
                <span>
                  Win {row.winRate !== null ? formatPercent(row.winRate) : "—"}
                </span>
                <span>
                  Avg W/L{" "}
                  {row.avgWinLoss !== null ? formatRatio(row.avgWinLoss) : "—"}
                </span>
                <span>PF {formatProfitFactor(row.profitFactor, row.wins)}</span>
                <span>
                  Expectancy{" "}
                  {row.avgR !== null ? formatRMultiple(row.avgR) : "—"}
                </span>
                {row.smallSample && (
                  <span className="text-2xs">campione ridotto</span>
                )}
              </div>
            </li>
          ))}
      </ul>
    </>
  );
}
