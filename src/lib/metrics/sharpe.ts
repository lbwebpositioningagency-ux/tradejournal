import Decimal from "decimal.js";
import {
  ANNUALIZATION,
  hasUndefinedReturn,
  TRADING_DAYS_PER_YEAR,
  type DailyReturn,
} from "./daily-series";
import type { MetricInfoData } from "./types";

/**
 * Sharpe Ratio ANNUALIZZATO sui ritorni giornalieri della serie unica
 * (daily-series.ts):
 *
 *   √252 × (rendimento medio − risk-free giornaliero) / deviazione standard
 *
 * Stessa serie e stesse convenzioni del Sortino (v. sortino.ts): ritorni come
 * frazione dell'equity di inizio giornata, sedute feriali senza trade a
 * ritorno 0, deviazione standard di popolazione sugli scarti dalla media.
 *
 * `riskFreeAnnual` è un tasso ANNUO e viene diviso per 252 prima di essere
 * sottratto alla media giornaliera. Prima non lo era: chiunque avesse passato
 * un 4% annuo se lo sarebbe visto sottrarre per intero da una media
 * giornaliera, con uno Sharpe sbagliato di ordini di grandezza. Nessun
 * chiamante lo usava, ma la firma era una trappola armata.
 *
 * null se: serie vuota, un giorno con ritorno non definito (v. la regola in
 * daily-series.ts), oppure deviazione standard zero.
 */
export function sharpeRatio(
  returns: Pick<DailyReturn, "ret">[],
  riskFreeAnnual = "0",
): string | null {
  if (returns.length === 0) return null;
  if (hasUndefinedReturn(returns)) return null;

  const riskFree = new Decimal(riskFreeAnnual).div(TRADING_DAYS_PER_YEAR);
  const n = new Decimal(returns.length);
  let sum = new Decimal(0);
  for (const point of returns) {
    sum = sum.plus(point.ret!);
  }
  const mean = sum.div(n);

  let squares = new Decimal(0);
  for (const point of returns) {
    const deviation = new Decimal(point.ret!).minus(mean);
    squares = squares.plus(deviation.times(deviation));
  }
  const stdDev = squares.div(n).sqrt();
  if (stdDev.isZero()) return null;

  return mean.minus(riskFree).div(stdDev).times(ANNUALIZATION).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const sharpeInfo: MetricInfoData = {
  label: "Sharpe Ratio (annualizzato)",
  description:
    "Rendimento medio giornaliero rapportato alla volatilità TOTALE, anche quella positiva: metrica classica di confronto, meno rappresentativa del Sortino per un trader discrezionale. Stessa serie del Sortino: sedute feriali, giornate senza trade a rendimento 0.",
  formula:
    "Sharpe = √252 × (media ritorni − risk-free) / dev. std dei ritorni · risk-free = 0 · r = P&L giorno / equity inizio giornata",
};
