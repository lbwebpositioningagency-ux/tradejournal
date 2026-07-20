import Decimal from "decimal.js";

/**
 * Win rate = vincenti / totale, come frazione 0-1 (scala 4).
 * Vale sia per i trade (Trade Win %) sia per le giornate (Day Win %):
 * i breakeven contano nel denominatore ma non nei vincenti.
 * Zero elementi → null (metrica non definita).
 */
export function winRate(wins: number, total: number): string | null {
  if (total === 0) return null;
  return new Decimal(wins).div(total).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const winRateInfo = {
  label: "Win Rate",
  description:
    "Percentuale di trade chiusi in profitto sul totale (i breakeven contano nel denominatore): misura quanto spesso hai ragione, da leggere sempre insieme al payoff.",
  formula: "Win % = trade vincenti / trade totali (BE inclusi nel totale)",
};

export const dayWinRateInfo = {
  label: "Day Win Rate",
  description:
    "Percentuale di giornate operative chiuse in verde: misura la costanza giorno per giorno, meno sensibile del win rate al singolo trade.",
  formula: "Day Win % = giornate con P&L > 0 / giornate operative",
};
