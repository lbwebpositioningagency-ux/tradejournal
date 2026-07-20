import Decimal from "decimal.js";

/**
 * Profit Factor = somma profitti / |somma perdite| (scala 4).
 *
 * Divisione per zero: se non ci sono perdite il PF non è definito → null.
 * La UI decide come mostrarlo ("∞" se ci sono profitti, "—" se zero trade).
 */
export function profitFactor(winSum: string, lossSum: string): string | null {
  const losses = new Decimal(lossSum).abs();
  if (losses.isZero()) return null;
  return new Decimal(winSum).div(losses).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const profitFactorInfo = {
  label: "Profit Factor",
  description:
    "Quanti euro/dollari guadagni per ogni unità persa: sopra 1 il sistema è profittevole, sopra 2 è robusto. Nessuna perdita = non definito (∞).",
  formula: "PF = Σ profitti / |Σ perdite|",
};
