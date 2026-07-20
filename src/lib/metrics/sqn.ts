import Decimal from "decimal.js";

/**
 * SQN (System Quality Number, Van Tharp):
 *
 *   √N × media(R-multiple) / deviazione standard(R-multiple)
 *
 * Calcolato sui trade CHIUSI con R-multiple valorizzato, dagli aggregati SQL
 * (N, ΣR, ΣR²) — mai da liste di trade. Deviazione standard di popolazione:
 * var = ΣR²/N − media²; eventuali residui negativi da arrotondamento Decimal
 * vengono azzerati.
 *
 * null se: meno di SQN_MIN_TRADES trade (statisticamente non significativo:
 * la UI deve dire "dati insufficienti", mai mostrare un numero fuorviante),
 * oppure deviazione standard zero (tutti gli R uguali).
 */
export const SQN_MIN_TRADES = 30;

export function sqn(
  rCount: number,
  rSum: string,
  rSumSq: string,
): string | null {
  if (rCount < SQN_MIN_TRADES) return null;

  const n = new Decimal(rCount);
  const mean = new Decimal(rSum).div(n);
  const variance = new Decimal(rSumSq).div(n).minus(mean.times(mean));
  if (variance.lte(0)) return null;

  return n.sqrt().times(mean).div(variance.sqrt()).toFixed(2);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const sqnInfo = {
  label: "SQN — System Quality Number",
  description:
    "Indice di Van Tharp sulla qualità del sistema: misura quanto è grande e stabile l'R medio dei tuoi trade. Sotto 30 trade con rischio definito non è statisticamente affidabile.",
  formula: "SQN = √N × media(R-multiple) / dev. std(R-multiple) · minimo 30 trade",
};
