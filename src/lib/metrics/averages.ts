import Decimal from "decimal.js";

/** Profitto medio dei trade vincenti (scala 2); null senza vincenti. */
export function avgWin(winSum: string, wins: number): string | null {
  if (wins === 0) return null;
  return new Decimal(winSum).div(wins).toFixed(2);
}

/**
 * Perdita media dei trade perdenti, come GRANDEZZA positiva (scala 2);
 * null senza perdenti. `lossSum` arriva col segno (≤ 0).
 */
export function avgLoss(lossSum: string, losses: number): string | null {
  if (losses === 0) return null;
  return new Decimal(lossSum).abs().div(losses).toFixed(2);
}

/** Rapporto Avg Win / Avg Loss (scala 4); null se una delle due manca. */
export function payoffRatio(
  avgWinValue: string | null,
  avgLossValue: string | null,
): string | null {
  if (avgWinValue === null || avgLossValue === null) return null;
  const loss = new Decimal(avgLossValue);
  if (loss.isZero()) return null;
  return new Decimal(avgWinValue).div(loss).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const avgWinLossInfo = {
  label: "Avg Win / Avg Loss",
  description:
    "Profitto medio dei trade vincenti contro perdita media dei perdenti: dice se quando hai ragione guadagni più di quanto perdi quando hai torto (payoff ratio = rapporto tra i due).",
  formula: "AvgWin = Σ profitti / n° win · AvgLoss = |Σ perdite| / n° loss · Payoff = AvgWin / AvgLoss",
};
