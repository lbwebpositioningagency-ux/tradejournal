import Decimal from "decimal.js";
import type { DailyPnl } from "./types";

/**
 * Sortino Ratio sui rendimenti GIORNALIERI (stessa serie di maxDrawdown):
 *
 *   (rendimento medio − MAR) / downside deviation
 *
 * dove la downside deviation è la radice della media dei quadrati delle sole
 * deviazioni NEGATIVE rispetto al MAR (rendimento minimo accettabile,
 * default 0), col denominatore su TUTTI i giorni (convenzione standard).
 *
 * I "rendimenti" sono i P&L giornalieri in valuta: il rapporto è
 * adimensionale, quindi dividere per il saldo non cambierebbe il risultato.
 * Non è annualizzato: confronta strategie sullo stesso orizzonte giornaliero.
 *
 * null se: nessun giorno, oppure nessuna deviazione negativa sotto il MAR
 * (downside deviation zero: rapporto non definito, mai un numero finto).
 */
export function sortinoRatio(
  days: Pick<DailyPnl, "netPnl">[],
  mar = "0",
): string | null {
  if (days.length === 0) return null;

  const marDec = new Decimal(mar);
  const n = new Decimal(days.length);
  let sum = new Decimal(0);
  let downsideSquares = new Decimal(0);

  for (const day of days) {
    const value = new Decimal(day.netPnl);
    sum = sum.plus(value);
    const deviation = value.minus(marDec);
    if (deviation.lt(0)) {
      downsideSquares = downsideSquares.plus(deviation.times(deviation));
    }
  }

  const downsideDeviation = downsideSquares.div(n).sqrt();
  if (downsideDeviation.isZero()) return null;

  return sum.div(n).minus(marDec).div(downsideDeviation).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const sortinoInfo = {
  label: "Sortino Ratio",
  description:
    "Rendimento medio giornaliero rapportato alla sola volatilità NEGATIVA: premia chi guadagna senza grandi giornate in rosso, ignorando la volatilità dei giorni buoni.",
  formula: "Sortino = (media rendimenti − MAR) / √(Σ min(r − MAR, 0)² / N) · MAR = 0",
};
