import Decimal from "decimal.js";

/**
 * SQN-100 (System Quality Number, Van Tharp):
 *
 *   √min(N, 100) × media(R-multiple) / deviazione standard(R-multiple)
 *
 * Calcolato sui trade CHIUSI con R-multiple valorizzato, dagli aggregati SQL
 * (N, ΣR, ΣR²) — mai da liste di trade. Deviazione standard di popolazione:
 * var = ΣR²/N − media²; eventuali residui negativi da arrotondamento Decimal
 * vengono azzerati.
 *
 * Q-06 — il √N è LIMITATO a 100 (convenzione "SQN-100"): senza cap lo stesso
 * sistema varrebbe 2,5 su 100 trade e 6+ su 600, misurando la dimensione
 * dello storico invece della qualità. La scala di lettura di Van Tharp
 * (2-2,5 medio, 3+ eccellente…) è tarata su N≈100: il cap la rende
 * applicabile anche a storici lunghi, e il numero smette di crescere
 * meccanicamente ogni mese.
 *
 * null se: meno di SQN_MIN_TRADES trade (statisticamente non significativo:
 * la UI deve dire "dati insufficienti", mai mostrare un numero fuorviante),
 * oppure deviazione standard zero (tutti gli R uguali).
 */
export const SQN_MIN_TRADES = 30;
export const SQN_CAP = 100;

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

  const nEff = Decimal.min(n, SQN_CAP);
  return nEff.sqrt().times(mean).div(variance.sqrt()).toFixed(2);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const sqnInfo = {
  label: "SQN-100 — System Quality Number",
  description:
    "Indice di Van Tharp sulla qualità del sistema: misura quanto è grande e stabile l'R medio dei tuoi trade. Il fattore √N è limitato a 100 (convenzione SQN-100): oltre quella soglia il numero crescerebbe con la dimensione dello storico, non con la qualità — così resta confrontabile con la scala di Van Tharp, tarata su ~100 trade. Sotto 30 trade con rischio definito non è statisticamente affidabile.",
  formula:
    "SQN-100 = √min(N, 100) × media(R-multiple) / dev. std(R-multiple) · minimo 30 trade",
};
