/**
 * B-04 — parsing dei numeri digitati in un'app interamente it-IT.
 *
 * `Number("50.000")` vale 50: il punto anglosassone è un decimale, ma per
 * chi scrive "50.000" in un campo Start Equity il significato è
 * CINQUANTAMILA — e la simulazione partiva da 50 unità senza alcun avviso.
 *
 * Regole (display only: il risultato alimenta i simulatori float, mai i
 * calcoli di denaro Decimal):
 * - una virgola presente → è il separatore decimale; i punti sono
 *   raggruppamento delle migliaia e si rimuovono ("1.234,56" → 1234.56);
 * - più di una virgola → NaN, mai un numero plausibile da input ambiguo;
 * - nessuna virgola e punti in pattern di raggruppamento (gruppi di 3 cifre:
 *   "50.000", "1.234.567") → migliaia, si rimuovono;
 * - altrimenti il punto resta decimale ("50.5" → 50.5).
 */
export function parseLocaleNumber(raw: string): number {
  const value = raw.trim();
  if (value === "") return NaN;

  const commas = value.split(",").length - 1;
  if (commas > 1) return NaN;

  let normalized: string;
  if (commas === 1) {
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(value)) {
    normalized = value.replace(/\./g, "");
  } else {
    normalized = value;
  }
  return Number(normalized);
}
