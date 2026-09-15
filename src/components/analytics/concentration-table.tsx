import type { Concentration } from "@/lib/metrics/concentration";
import { formatNumber } from "@/lib/format-number";
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
              <td className="py-2">
                {/* Cifra e pastiglia in un flex che va a capo: a 390 la
                    pastiglia scende sotto la cifra intera invece di spezzarsi
                    in due righe e uscire dal bordo della cella. */}
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      "font-medium whitespace-nowrap tabular-nums",
                      pnlColorClass(slice.netWithout),
                    )}
                  >
                    {formatMoney(slice.netWithout, currency)}
                  </span>
                  {slice.flipsToLoss && (
                    /* Testo neutro con il filo: sul fondo tinto il rosso scendeva a
                       4,27:1. Il colore del segno resta sulla cifra accanto. */
                    <span className="rounded-full border border-loss/40 px-2 py-0.5 text-xs whitespace-nowrap text-foreground">
                      va in perdita
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConcentrationNotes data={data} />
    </div>
  );
}

/**
 * Le due scelte che la tabella non può mostrare da sola: come diventa un
 * numero di trade una percentuale che non cade su un intero, e perché una
 * riga può nominare più soglie. Scritte sotto, non in un tooltip.
 */
function ConcentrationNotes({ data }: { data: Concentration }) {
  const merged = data.slices.filter((s) => s.percents.length > 1);
  return (
    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
      <p>
        Le soglie sono percentuali dei {data.winners} trade vincenti, arrotondate per
        eccesso: ogni riga contiene almeno un trade.
        {data.rounding ? (
          <>
            {" "}
            Qui il {data.rounding.percent}% vale{" "}
            {formatNumber(data.rounding.exact, { decimals: data.rounding.exact.includes(".") ? 2 : 0 })}{" "}
            trade e diventa {data.rounding.trades}.
          </>
        ) : null}
      </p>
      {merged.map((s) => (
        <p key={s.label}>
          Con {data.winners} vincenti {joinPercents(s.percents)} danno lo stesso
          gruppo di {s.trades} trade: una riga sola.
        </p>
      ))}
    </div>
  );
}

function joinPercents(percents: number[]): string {
  const parts = percents.map((p) => `${p === 1 ? "l'" : "il "}${p}%`);
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}
