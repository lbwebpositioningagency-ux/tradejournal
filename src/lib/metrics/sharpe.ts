import Decimal from "decimal.js";
import type { DailyPnl } from "./types";

/**
 * Sharpe Ratio classico sui rendimenti GIORNALIERI:
 *
 *   (rendimento medio − risk free) / deviazione standard dei rendimenti
 *
 * Deviazione standard di POPOLAZIONE (÷N, due passate su una serie già
 * ridotta dal SQL), risk free default 0, non annualizzato: stesse convenzioni
 * del Sortino, di cui è la metrica di CONFRONTO (penalizza anche la
 * volatilità positiva, quindi è meno rappresentativo per un trader retail).
 *
 * null se: nessun giorno, oppure deviazione standard zero (tutti i
 * rendimenti uguali: rapporto non definito).
 */
export function sharpeRatio(
  days: Pick<DailyPnl, "netPnl">[],
  riskFree = "0",
): string | null {
  if (days.length === 0) return null;

  const n = new Decimal(days.length);
  let sum = new Decimal(0);
  for (const day of days) {
    sum = sum.plus(day.netPnl);
  }
  const mean = sum.div(n);

  let squares = new Decimal(0);
  for (const day of days) {
    const deviation = new Decimal(day.netPnl).minus(mean);
    squares = squares.plus(deviation.times(deviation));
  }
  const stdDev = squares.div(n).sqrt();
  if (stdDev.isZero()) return null;

  return mean.minus(riskFree).div(stdDev).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const sharpeInfo = {
  label: "Sharpe Ratio",
  description:
    "Rendimento medio giornaliero rapportato alla volatilità TOTALE (anche quella positiva): metrica classica di confronto, meno rappresentativa del Sortino per un trader discrezionale.",
  formula: "Sharpe = media rendimenti / deviazione standard dei rendimenti giornalieri",
};
