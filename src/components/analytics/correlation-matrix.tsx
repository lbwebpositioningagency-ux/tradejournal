import {
  correlationTone,
  CORRELATION_MIN_DAYS,
  CORRELATION_TONE_LABELS,
  pairKey,
  type CorrelationMatrix,
  type CorrelationPair,
  type CorrelationTone,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { formatRatio } from "@/lib/money";

/**
 * HEATMAP triangolare delle correlazioni fra strategie (tavola Claude Design
 * «Analytics - durata drawdown e correlazione», riquadro 3).
 *
 * Triangolare e non quadrata: la metà sopra la diagonale ripeterebbe la
 * stessa informazione, e la diagonale vale 1 per definizione.
 *
 * Ogni cella scrive DUE cose visibili, non in un tooltip: il coefficiente e i
 * giorni in cui le due strategie hanno operato insieme. Sotto la soglia il
 * coefficiente non c'è — bordo tratteggiato, giorni in comune e quanti ne
 * servono — perché una correlazione su venti osservazioni è rumore che
 * sembra un dato.
 *
 * La tinta tiene il SEGNO e il RUMORE: neutra dentro la banda 1,96/√n, tinta
 * perdita quando le due si muovono insieme (rischio moltiplicato), tinta
 * profitto quando si compensano. Il testo resta foreground sulla velatura:
 * il token P&L sopra una velatura di se stesso non regge AA (misurato), e il
 * colore non è mai l'unica informazione — la legenda lo dice a parole.
 */

const TONE_CLASS: Record<CorrelationTone, string> = {
  "insieme-forte": "bg-loss/25",
  insieme: "bg-warning/20",
  rumore: "bg-muted",
  opposte: "bg-profit/20",
};

function cellTitle(pair: CorrelationPair, rowLabel: string, colLabel: string) {
  if (pair.lowSample) {
    return `${rowLabel} e ${colLabel}: solo ${pair.commonDays} giorni in comune, ne servono ${CORRELATION_MIN_DAYS}`;
  }
  if (pair.r === null) {
    return `${rowLabel} e ${colLabel}: una delle due serie è piatta, la correlazione non è definita`;
  }
  const tone = correlationTone(pair);
  return `${rowLabel} e ${colLabel}: ${formatRatio(pair.r)}, ${tone ? CORRELATION_TONE_LABELS[tone] : ""} su ${pair.commonDays} giorni in comune`;
}

export function CorrelationMatrixTable({
  matrix,
}: {
  matrix: CorrelationMatrix;
}) {
  const { keys, labels, pairs } = matrix;
  if (keys.length < 2) return null;

  // Le colonne sono tutte le strategie tranne l'ultima, le righe tutte
  // tranne la prima: è esattamente il triangolo inferiore.
  const rows = keys.slice(1);
  const columns = keys.slice(0, -1);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-sm tabular-nums">
          <caption className="sr-only">
            Correlazione dei P&amp;L giornalieri fra le strategie del periodo, con
            i giorni in cui ogni coppia ha operato insieme
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left text-xs font-normal text-muted-foreground">
                <span className="sr-only">Strategia</span>
              </th>
              {columns.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="max-w-[4.5rem] truncate px-1 text-left text-xs font-medium text-muted-foreground sm:max-w-28"
                  title={labels[key]}
                >
                  {labels[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowKey, rowIndex) => (
              <tr key={rowKey}>
                <th
                  scope="row"
                  className="max-w-24 truncate pr-1 text-left text-xs font-medium sm:max-w-32 sm:pr-2"
                  title={labels[rowKey]}
                >
                  {labels[rowKey]}
                </th>
                {columns.map((colKey, colIndex) => {
                  // Solo il triangolo inferiore: oltre la diagonale, niente.
                  if (colIndex > rowIndex) {
                    return <td key={colKey} aria-hidden />;
                  }
                  const pair = pairs.get(pairKey(rowKey, colKey));
                  if (!pair) return <td key={colKey} />;
                  const tone = correlationTone(pair);
                  const vuota = pair.lowSample || pair.r === null;
                  return (
                    <td
                      key={colKey}
                      title={cellTitle(pair, labels[rowKey], labels[colKey])}
                      className={cn(
                        "h-14 w-[4.5rem] rounded-md px-1 text-center align-middle sm:w-28 sm:px-2",
                        vuota
                          ? "border border-dashed border-[var(--rule)]"
                          : tone && TONE_CLASS[tone],
                      )}
                    >
                      {vuota ? (
                        <>
                          <span className="block text-xs text-muted-foreground">
                            {pair.commonDays} gg<span className="hidden sm:inline"> in comune</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {pair.lowSample
                              ? `servono ${CORRELATION_MIN_DAYS}`
                              : "serie piatta"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className={cn(
                              "block text-[15px] leading-5 text-foreground",
                              tone === "insieme-forte" ? "font-semibold" : "font-medium",
                            )}
                          >
                            {formatRatio(pair.r)}
                          </span>
                          <span className="block text-xs text-[var(--foreground-2)]">
                            {pair.commonDays} gg<span className="hidden sm:inline"> in comune</span>
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--foreground-2)]" aria-label="Legenda">
        <LegendItem className="bg-loss/25">insieme, forte (da 0,6)</LegendItem>
        <LegendItem className="bg-warning/20">insieme</LegendItem>
        <LegendItem className="bg-muted">non distinguibile da zero</LegendItem>
        <LegendItem className="bg-profit/20">si compensano</LegendItem>
        <LegendItem className="border border-dashed border-[var(--rule)]">
          meno di {CORRELATION_MIN_DAYS} giorni in comune
        </LegendItem>
      </ul>
    </div>
  );
}

function LegendItem({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn("inline-block size-3 rounded-sm", className)} />
      {children}
    </li>
  );
}

/** Tutte le coppie in una tabella: i numeri che la heatmap riassume. */
export function CorrelationPairsTable({ matrix }: { matrix: CorrelationMatrix }) {
  const righe = [...matrix.pairs.values()].sort(
    (a, b) => b.commonDays - a.commonDays,
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm tabular-nums">
        <caption className="sr-only">Correlazione per coppia di strategie</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Coppia</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Giorni in comune</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Giorni del calcolo</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Correlazione</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Rumore ±</th>
            <th scope="col" className="py-1.5 font-medium">Lettura</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((p) => {
            const tone = correlationTone(p);
            return (
              <tr key={`${p.a}|${p.b}`} className="border-b last:border-0">
                <td className="py-1.5 pr-3">
                  {matrix.labels[p.a]} × {matrix.labels[p.b]}
                </td>
                <td className="py-1.5 pr-3 text-right">{p.commonDays}</td>
                <td className="py-1.5 pr-3 text-right">{p.unionDays}</td>
                <td className="py-1.5 pr-3 text-right">
                  {p.r === null ? "—" : formatRatio(p.r)}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {p.noiseBand === null ? "—" : formatRatio(p.noiseBand)}
                </td>
                <td className="py-1.5 text-muted-foreground">
                  {p.lowSample
                    ? `campione insufficiente (servono ${CORRELATION_MIN_DAYS} giorni in comune)`
                    : tone
                      ? CORRELATION_TONE_LABELS[tone]
                      : "non definita (serie piatta)"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
