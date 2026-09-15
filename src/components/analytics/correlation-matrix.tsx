import Link from "next/link";
import {
  correlationTone,
  CORRELATION_MIN_OBSERVATIONS,
  CORRELATION_TONE_LABELS,
  CORRELATION_UNITS,
  pairKey,
  type CorrelationGrain,
  type CorrelationMatrix,
  type CorrelationPair,
  type CorrelationTone,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { formatRatio } from "@/lib/money";

/**
 * HEATMAP triangolare delle correlazioni fra strategie (tavola Claude Design
 * «Analytics - durata drawdown e correlazione», riquadri 3, 4, 6 e 7).
 *
 * Triangolare e non quadrata: la metà sopra la diagonale ripeterebbe la
 * stessa informazione, e la diagonale vale 1 per definizione.
 *
 * Ogni cella scrive DUE cose visibili, non in un tooltip: il coefficiente e i
 * periodi (settimane o mesi) in cui le due strategie hanno operato insieme —
 * gli stessi su cui il coefficiente è calcolato. Sotto la soglia il
 * coefficiente non c'è: bordo tratteggiato, periodi in comune e quanti ne
 * servono.
 *
 * La tinta tiene il SEGNO e il RUMORE: neutra dentro la banda 1,96/√n, tinta
 * perdita quando le due si muovono insieme (rischio moltiplicato), tinta
 * profitto quando si compensano. Il testo resta foreground sulla velatura, e
 * il colore non è mai l'unica informazione: la legenda lo dice a parole.
 */

const TONE_CLASS: Record<CorrelationTone, string> = {
  "insieme-forte": "bg-loss/25",
  insieme: "bg-warning/20",
  rumore: "bg-muted",
  opposte: "bg-profit/20",
};

function cellTitle(
  pair: CorrelationPair,
  grain: CorrelationGrain,
  rowLabel: string,
  colLabel: string,
) {
  const units = CORRELATION_UNITS[grain];
  const min = CORRELATION_MIN_OBSERVATIONS[grain];
  if (pair.lowSample) {
    return `${rowLabel} e ${colLabel}: solo ${pair.common} ${units.many} in comune, ne servono ${min}`;
  }
  if (pair.r === null) {
    return `${rowLabel} e ${colLabel}: una delle due serie è piatta, la correlazione non è definita`;
  }
  const tone = correlationTone(pair);
  return `${rowLabel} e ${colLabel}: ${formatRatio(pair.r)}, ${tone ? CORRELATION_TONE_LABELS[tone] : ""} su ${pair.common} ${units.many} in comune`;
}

export function CorrelationMatrixTable({
  matrix,
}: {
  matrix: CorrelationMatrix;
}) {
  const { keys, labels, pairs, grain } = matrix;
  if (keys.length < 2) return null;
  const units = CORRELATION_UNITS[grain];
  const min = CORRELATION_MIN_OBSERVATIONS[grain];

  // Le colonne sono tutte le strategie tranne l'ultima, le righe tutte
  // tranne la prima: è esattamente il triangolo inferiore.
  const rows = keys.slice(1);
  const columns = keys.slice(0, -1);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-sm tabular-nums">
          <caption className="sr-only">
            Correlazione dei P&amp;L per {units.one} fra le strategie del periodo, con
            le {units.many} in cui ogni coppia ha operato insieme
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
                  className="max-w-[4.5rem] truncate px-1 text-left text-xs font-medium text-muted-foreground sm:max-w-32"
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
                      title={cellTitle(pair, grain, labels[rowKey], labels[colKey])}
                      className={cn(
                        "h-14 w-[4.5rem] rounded-md px-1 text-center align-middle sm:w-32 sm:px-2",
                        vuota
                          ? "border border-dashed border-[var(--rule)]"
                          : tone && TONE_CLASS[tone],
                      )}
                    >
                      {vuota ? (
                        <>
                          <span className="block whitespace-nowrap text-xs text-muted-foreground">
                            {pair.common} {units.short}
                            <span className="hidden sm:inline"> in comune</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {pair.lowSample ? `servono ${min}` : "serie piatta"}
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
                          <span className="block whitespace-nowrap text-xs text-[var(--foreground-2)]">
                            {pair.common} {units.short}
                            <span className="hidden sm:inline"> in comune</span>
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
          meno di {min} {units.many} in comune
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

/**
 * Stato di prima classe: con lo storico attuale NESSUNA coppia arriva alla
 * soglia del periodo scelto. Al posto di una griglia di celle vuote, la frase
 * che lo dice, la coppia più vicina con quanti periodi ha e quanti ne mancano,
 * e — se c'è — la strada verso il periodo che invece si calcola.
 */
export function CorrelationUnavailable({
  grain,
  closest,
  labels,
  periods,
  alternative,
}: {
  grain: CorrelationGrain;
  /** La coppia con più periodi in comune. */
  closest: CorrelationPair;
  labels: Record<string, string>;
  /** Periodi completi coperti dallo storico nel periodo selezionato. */
  periods: number;
  /** L'altro periodo, se lì almeno una coppia è calcolabile. */
  alternative: { label: string; href: string; usable: number; total: number } | null;
}) {
  const units = CORRELATION_UNITS[grain];
  const min = CORRELATION_MIN_OBSERVATIONS[grain];
  const missing = Math.max(0, min - closest.common);
  const filled = Math.min(100, (closest.common / min) * 100);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--rule)] p-4">
      <p className="text-sm font-semibold text-foreground">
        Per {units.one} la correlazione non è calcolabile con lo storico attuale
      </p>
      <p className="max-w-[46rem] text-xs leading-5 text-[var(--foreground-2)]">
        Servono {min} {units.many} in cui due strategie operano entrambe. La coppia con
        più {units.many} in comune, {labels[closest.a]} × {labels[closest.b]}, ne ha{" "}
        {closest.common}: ne mancano {missing}. Lo storico del periodo copre {periods}{" "}
        {periods === 1 ? `${units.one} completo` : `${units.many} complet${grain === "week" ? "e" : "i"}`}.
      </p>
      <div className="flex max-w-[28rem] items-center gap-3">
        <div className="relative h-1.5 flex-1 rounded-full bg-muted" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--foreground-2)]"
            style={{ width: `${filled}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {closest.common} di {min} {units.many}
        </span>
      </div>
      {alternative ? (
        <p className="text-xs text-[var(--foreground-2)]">
          <Link
            href={alternative.href}
            scroll={false}
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Guarda per {alternative.label.toLowerCase()}
          </Link>
          : lì {alternative.usable === 1 ? "è calcolabile" : "sono calcolabili"}{" "}
          {alternative.usable} {alternative.usable === 1 ? "coppia" : "coppie"} su{" "}
          {alternative.total}.
        </p>
      ) : null}
    </div>
  );
}

/** Tutte le coppie in una tabella: i numeri che la heatmap riassume. */
export function CorrelationPairsTable({ matrix }: { matrix: CorrelationMatrix }) {
  const units = CORRELATION_UNITS[matrix.grain];
  const min = CORRELATION_MIN_OBSERVATIONS[matrix.grain];
  const Many = units.many.charAt(0).toUpperCase() + units.many.slice(1);
  const righe = [...matrix.pairs.values()].sort((a, b) => b.common - a.common);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm tabular-nums">
        <caption className="sr-only">Correlazione per coppia di strategie</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Coppia</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">{Many} in comune</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Escluse, una sola attiva</th>
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
                <td className="py-1.5 pr-3 text-right">{p.common}</td>
                <td className="py-1.5 pr-3 text-right">{p.onlyOne}</td>
                <td className="py-1.5 pr-3 text-right">
                  {p.r === null ? "—" : formatRatio(p.r)}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {p.noiseBand === null ? "—" : formatRatio(p.noiseBand)}
                </td>
                <td className="py-1.5 text-muted-foreground">
                  {p.lowSample
                    ? `campione insufficiente (servono ${min} ${units.many} in comune)`
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
