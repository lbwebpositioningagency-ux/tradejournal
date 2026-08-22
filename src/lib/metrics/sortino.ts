import Decimal from "decimal.js";
import {
  ANNUALIZATION,
  hasUndefinedReturn,
  TRADING_DAYS_PER_YEAR,
  type DailyReturn,
} from "./daily-series";
import type { MetricInfoData } from "./types";

/**
 * Sortino Ratio ANNUALIZZATO sui ritorni giornalieri della serie unica
 * (daily-series.ts):
 *
 *   √252 × (rendimento medio − MAR giornaliero) / downside deviation
 *
 * dove la downside deviation è la radice della media dei quadrati delle sole
 * deviazioni NEGATIVE rispetto al MAR, col denominatore su TUTTI i giorni
 * della serie (convenzione standard).
 *
 * Il ritorno di una giornata è `P&L del giorno / equity a inizio giornata`,
 * quindi una FRAZIONE, non un importo: due conti di dimensione diversa sono
 * confrontabili. Le sedute feriali senza trade entrano a ritorno 0 — la
 * versione precedente le escludeva e questo alzava il rapporto dell'8-18%
 * misurato, tanto più quanto più il conto opera di rado.
 *
 * `marAnnual` è il rendimento minimo accettabile su base ANNUA (default 0):
 * viene diviso per 252 prima del confronto coi ritorni giornalieri. Passare
 * un tasso annuo e sottrarlo a una media giornaliera è l'errore che questa
 * firma esiste per rendere impossibile.
 *
 * null se: serie vuota, un giorno con ritorno non definito (v. la regola in
 * daily-series.ts), oppure downside deviation zero (rapporto non definito,
 * mai un numero finto).
 */
export function sortinoRatio(
  returns: Pick<DailyReturn, "ret">[],
  marAnnual = "0",
): string | null {
  if (returns.length === 0) return null;
  if (hasUndefinedReturn(returns)) return null;

  const mar = new Decimal(marAnnual).div(TRADING_DAYS_PER_YEAR);
  const n = new Decimal(returns.length);
  let sum = new Decimal(0);
  let downsideSquares = new Decimal(0);

  for (const point of returns) {
    const value = new Decimal(point.ret!);
    sum = sum.plus(value);
    const deviation = value.minus(mar);
    if (deviation.lt(0)) {
      downsideSquares = downsideSquares.plus(deviation.times(deviation));
    }
  }

  const downsideDeviation = downsideSquares.div(n).sqrt();
  if (downsideDeviation.isZero()) return null;

  return sum
    .div(n)
    .minus(mar)
    .div(downsideDeviation)
    .times(ANNUALIZATION)
    .toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const sortinoInfo: MetricInfoData = {
  label: "Sortino Ratio (annualizzato)",
  description:
    "Rendimento medio giornaliero rapportato alla sola volatilità NEGATIVA: premia chi guadagna senza grandi giornate in rosso, ignorando la volatilità dei giorni buoni. Serie giornaliera sulle sedute feriali, con le giornate senza trade contate a rendimento 0.",
  formula:
    "Sortino = √252 × (media ritorni − MAR) / √(Σ min(r − MAR, 0)² / N) · MAR = 0 · r = P&L giorno / equity inizio giornata",
};
