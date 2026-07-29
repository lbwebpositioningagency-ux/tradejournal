import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — BREAK-EVEN WIN RATE: la percentuale di trade vincenti che serve, col
 * TUO payoff, per non perdere e non guadagnare.
 *
 *   BE% = 1 / (1 + payoff)      payoff = AvgWin / AvgLoss
 *
 * È la metrica che smonta la domanda sbagliata ("qual è un buon win rate?"):
 * con payoff 3 basta il 25%, con payoff 0,5 non basta il 66%. Il numero da
 * guardare non è il win rate ma la sua DISTANZA da questa soglia.
 */
export function breakEvenWinRate(payoff: string | null): string | null {
  if (payoff === null) return null;
  const value = new Decimal(payoff);
  // Payoff nullo o negativo: la soglia non esiste (nessuna vincita media da
  // rapportare), e inventarne una sarebbe peggio che dire "non calcolabile".
  if (value.lte(0)) return null;
  return new Decimal(1).div(value.plus(1)).toFixed(4);
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
    "La percentuale di vincenti che ti serve, con il tuo rapporto vincita/perdita media, per chiudere in pari. Rende inutile la domanda «qual è un buon win rate?»: con payoff 3 basta il 25%, con payoff 0,5 non basta nemmeno il 66%. Conta la distanza fra il tuo win rate e questa soglia, non il win rate da solo.",
  formula: "BE% = 1 / (1 + payoff) · payoff = AvgWin / AvgLoss",
};
