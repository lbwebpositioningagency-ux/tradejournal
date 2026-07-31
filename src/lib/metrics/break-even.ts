import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — BREAK-EVEN WIN RATE: la percentuale di trade vincenti che serve, col
 * TUO payoff, per non perdere e non guadagnare.
 *
 *   BE% = (1 − quota BE) / (1 + payoff)      payoff = AvgWin / AvgLoss
 *
 * Q-09 — la soglia è COERENTE con la convenzione del win rate dell'app, che
 * tiene i breakeven nel denominatore: con quota BE = B, il pareggio
 * W·AvgWin = L·AvgLoss con L = 1 − W − B dà W* = (1 − B)/(1 + payoff).
 * La versione a due esiti (1/(1+payoff)) è il caso B = 0: con B = 10% e
 * payoff 1 la soglia vera è 45%, non 50% — e siccome la card dice che conta
 * la DISTANZA dalla soglia, la distanza deve essere quella giusta.
 *
 * È la metrica che smonta la domanda sbagliata ("qual è un buon win rate?"):
 * con payoff 3 basta il 25%, con payoff 0,5 non basta il 66%.
 */
export function breakEvenWinRate(
  payoff: string | null,
  /** Quota di breakeven sul totale (0-1); null/omessa = modello a due esiti. */
  beShare: string | null = null,
): string | null {
  if (payoff === null) return null;
  const value = new Decimal(payoff);
  // Payoff nullo o negativo: la soglia non esiste (nessuna vincita media da
  // rapportare), e inventarne una sarebbe peggio che dire "non calcolabile".
  if (value.lte(0)) return null;
  const be = beShare === null ? new Decimal(0) : new Decimal(beShare);
  // Quota BE fuori da [0,1): soglia non definibile (tutti breakeven = nessun
  // trade direzionale da soppesare).
  if (be.lt(0) || be.gte(1)) return null;
  return new Decimal(1).minus(be).div(value.plus(1)).toFixed(4);
}

/**
 * Margine: win rate effettivo meno soglia di break-even, in punti di
 * frazione (positivo = sei sopra la soglia). null se manca uno dei due.
 */
export function winRateMargin(
  actual: string | null,
  breakEven: string | null,
): string | null {
  if (actual === null || breakEven === null) return null;
  return new Decimal(actual).minus(breakEven).toFixed(4);
}

export const breakEvenWinRateInfo: MetricInfoData = {
  label: "Break-even win rate",
  description:
    "La percentuale di vincenti che ti serve, con il tuo rapporto vincita/perdita media, per chiudere in pari. Tiene conto della tua quota di breakeven (che non perdono e non guadagnano): più breakeven fai, meno vincenti servono. Rende inutile la domanda «qual è un buon win rate?»: con payoff 3 basta il 25%, con payoff 0,5 non basta nemmeno il 66%. Conta la distanza fra il tuo win rate e questa soglia, non il win rate da solo.",
  formula:
    "BE% = (1 − quota BE) / (1 + payoff) · payoff = AvgWin / AvgLoss · quota BE = breakeven / totale",
};
