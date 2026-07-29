import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — R² DELL'EQUITY CURVE rispetto a una retta: quanto la crescita è
 * REGOLARE, non quanto è grande.
 *
 * Due conti che finiscono l'anno allo stesso saldo raccontano storie diverse
 * se uno ci è arrivato in linea retta e l'altro con un salto e sei mesi
 * piatti. R² vicino a 1 = progressione costante; R² basso = il risultato è
 * concentrato in pochi episodi.
 *
 * ATTENZIONE (dichiarata anche in UI): un R² alto NON significa "sistema
 * buono". Una curva che scende dritta ha R² ≈ 1. Va letto insieme al segno
 * della pendenza, che infatti torna insieme al rapporto.
 */

export interface EquityFit {
  /** Coefficiente di determinazione 0-1; null se non definito. */
  r2: string | null;
  /** Pendenza della retta: variazione di equity per punto della serie. */
  slope: string | null;
  /** Punti della serie su cui è calcolato. */
  points: number;
}

/**
 * Regressione lineare dell'equity sul progressivo della serie (0, 1, 2…).
 *
 * L'input è una serie GIÀ RIDOTTA (una equity per seduta, come la produce
 * `dailyReturns`): qui non si caricano trade.
 *
 * null quando: meno di 3 punti (con due punti la retta passa esatta e R² = 1
 * per costruzione, che è un'informazione falsa), oppure equity costante
 * (varianza nulla: il rapporto non è definito).
 */
export function equityLinearFit(equity: string[]): EquityFit {
  const n = equity.length;
  if (n < 3) return { r2: null, slope: null, points: n };

  const size = new Decimal(n);
  const values = equity.map((v) => new Decimal(v));

  let sumX = new Decimal(0);
  let sumY = new Decimal(0);
  for (let i = 0; i < n; i++) {
    sumX = sumX.plus(i);
    sumY = sumY.plus(values[i]);
  }
  const meanX = sumX.div(size);
  const meanY = sumY.div(size);

  let sxy = new Decimal(0);
  let sxx = new Decimal(0);
  let syy = new Decimal(0);
  for (let i = 0; i < n; i++) {
    const dx = new Decimal(i).minus(meanX);
    const dy = values[i].minus(meanY);
    sxy = sxy.plus(dx.times(dy));
    sxx = sxx.plus(dx.times(dx));
    syy = syy.plus(dy.times(dy));
  }

  // Equity piatta: nessuna varianza da spiegare, il rapporto non esiste.
  if (syy.isZero() || sxx.isZero()) {
    return { r2: null, slope: null, points: n };
  }

  const slope = sxy.div(sxx);
  const r2 = sxy.times(sxy).div(sxx.times(syy));
  return {
    r2: Decimal.min(Decimal.max(r2, 0), 1).toFixed(4),
    slope: slope.toFixed(2),
    points: n,
  };
}

export const equityFitInfo: MetricInfoData = {
  label: "Regolarità dell'equity (R²)",
  description:
    "Quanto la tua curva di equity somiglia a una retta: vicino a 1 la crescita è costante, in basso il risultato è concentrato in pochi episodi e il resto del periodo è piatto o altalenante. Non è un voto di qualità — anche una discesa regolare ha R² alto — quindi si legge insieme alla pendenza.",
  formula: "R² della regressione lineare dell'equity sul progressivo delle sedute",
};
