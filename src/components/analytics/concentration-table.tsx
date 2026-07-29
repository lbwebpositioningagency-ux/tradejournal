import type { Concentration } from "@/lib/metrics/concentration";
import { formatMoney, formatPercent, pnlColorClass } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * §3 — concentrazione del profitto. La colonna che conta è l'ultima: quanto
 * resta TOGLIENDO quei trade. La barra è la quota sul profitto lordo, così
 * la lettura è immediata anche senza confrontare percentuali a mente.
 *
 * Componente di sola presentazione (server): nessuna conversione numerica
 * oltre alla larghezza della barra.
 */
export function ConcentrationTable({
  data,
  currency,
}: {
  data: Concentration;
  currency: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Gruppo</th>
            <th className="py-2 pr-3 text-right font-medium">
              Quota del profitto lordo
            </th>
            <th className="py-2 text-right font-medium">
              P&amp;L netto senza questi trade
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slices.map((slice) => (
            <tr key={slice.label} className="border-b last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">{slice.label}</td>
              <td className="py-2 pr-3">
                <div className="flex items-center justify-end gap-2">
                  {slice.share !== null && (
                    <div
                      className="hidden h-1.5 w-24 rounded-full bg-muted sm:block"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-[var(--chart-1)]"
                        style={{
                          width: `${Math.min(100, Math.round(Number(slice.share) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  <span className="tabular-nums">
                    {slice.share === null ? "—" : formatPercent(slice.share)}
                  </span>
                </div>
              </td>
              <td
                className={cn(
                  "py-2 text-right font-medium tabular-nums",
                  pnlColorClass(slice.netWithout),
                )}
              >
                {formatMoney(slice.netWithout, currency)}
                {slice.flipsToLoss && (
                  <span className="ml-2 rounded-full bg-loss/10 px-2 py-0.5 text-xs font-normal text-loss">
                    va in perdita
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
