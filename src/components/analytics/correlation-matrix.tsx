import {
  correlationTone,
  CORRELATION_MIN_DAYS,
  pairKey,
  type CorrelationMatrix,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { formatRatio } from "@/lib/money";

/**
 * Matrice triangolare delle correlazioni fra strategie.
 *
 * Triangolare e non quadrata: la metà sopra la diagonale ripeterebbe la
 * stessa informazione, e la diagonale vale 1 per definizione. Mostrarle
 * riempirebbe di numeri già noti la parte di schermo che serve a leggere
 * quelli veri.
 *
 * Il colore NON è l'unica informazione (regola daltonismo del progetto): il
 * numero è sempre scritto, e la sua lettura in parole sta nel titolo della
 * cella. La tinta usa i token P&L — una correlazione alta fra due strategie
 * è un rischio concentrato, quindi rossa; una bassa è diversificazione,
 * quindi verde — e segue la coppia scelta in Impostazioni.
 */
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">
          Correlazione dei P&amp;L giornalieri fra le strategie del periodo
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-40 text-left text-xs font-normal text-muted-foreground">
              Strategia
            </th>
            {columns.map((key) => (
              <th
                key={key}
                scope="col"
                className="max-w-24 truncate px-1 text-xs font-normal text-muted-foreground"
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
                className="max-w-40 truncate text-left text-xs font-medium"
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
                const tone = correlationTone(pair?.r ?? null);
                const title =
                  pair === undefined
                    ? undefined
                    : pair.r === null
                      ? pair.lowSample
                        ? `Solo ${pair.days} giornate comuni: ne servono ${CORRELATION_MIN_DAYS}`
                        : "Una delle due serie è piatta: la correlazione non è definita"
                      : `${labels[rowKey]} e ${labels[colKey]}: correlazione ${tone} su ${pair.days} giornate comuni`;
                return (
                  <td
                    key={colKey}
                    title={title}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-center tabular-nums",
                      // Testo foreground su tinta: il token P&L sopra una
                      // velatura di se stesso non regge AA (misurato).
                      tone === "alta" && "bg-loss/25 font-semibold",
                      tone === "media" && "bg-warning/20",
                      tone === "bassa" && "bg-profit/20",
                      tone === null && "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {pair?.r === null || pair === undefined
                      ? "—"
                      : formatRatio(pair.r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
