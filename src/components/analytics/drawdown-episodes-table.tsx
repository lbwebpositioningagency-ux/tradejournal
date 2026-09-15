import type { DrawdownEpisode } from "@/lib/metrics/drawdown-episodes";
import { formatPercent, formatSignedMoney } from "@/lib/money";

/** "2026-07-21" → "21/07/2026". */
function dayLabel(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Elenco degli episodi di drawdown, dal più lungo. L'episodio in corso sta in
 * testa e dichiara che durata e recupero sono solo un minimo.
 */
export function DrawdownEpisodesTable({
  episodes,
  open,
  currency,
}: {
  episodes: DrawdownEpisode[];
  open: DrawdownEpisode | null;
  currency: string;
}) {
  const rows = [
    ...(open ? [open] : []),
    ...[...episodes].sort(
      (a, b) =>
        b.durationSessions - a.durationSessions ||
        (a.peakDay ?? "").localeCompare(b.peakDay ?? ""),
    ),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm tabular-nums">
        <caption className="sr-only">
          Episodi di drawdown del periodo, dal più lungo, durate in sedute
        </caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Dal massimo del</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Minimo</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Ritorno</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Profondità</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Durata</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Discesa</th>
            <th scope="col" className="py-1.5 text-right font-medium">Recupero</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const inCorso = e.recoveryDay === null;
            return (
              <tr key={`${e.peakDay ?? "inizio"}-${e.troughDay}`} className="border-b last:border-0">
                <td className="py-1.5 pr-3">
                  {e.peakDay === null ? "saldo iniziale" : dayLabel(e.peakDay)}
                </td>
                <td className="py-1.5 pr-3">{dayLabel(e.troughDay)}</td>
                <td className="py-1.5 pr-3">
                  {inCorso ? (
                    <span className="font-medium">in corso</span>
                  ) : (
                    dayLabel(e.recoveryDay!)
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {formatSignedMoney(`-${e.depth}`, currency)}
                  {e.depthPct !== null && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatPercent(`-${e.depthPct}`)}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {inCorso ? "≥ " : ""}
                  {e.durationSessions}
                </td>
                <td className="py-1.5 pr-3 text-right">{e.declineSessions}</td>
                <td className="py-1.5 text-right">
                  {inCorso ? "≥ " : ""}
                  {e.recoverySessions}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
