import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * W4 — underwater plot: quanto (e quanto a lungo) l'equity sta sotto il suo
 * picco. La curva complementare del P&L cumulativo: profondità e durata dei
 * drawdown, con i recuperi visibili come risalite verso lo zero.
 */

export interface UnderwaterPoint {
  day: string;
  /** Drawdown come frazione ≤ 0 del picco (scala 4); -1 = -100%. */
  ddPct: string;
}

/**
 * Serie underwater dalla stessa serie giornaliera del P&L cumulativo.
 * Picco ≤ 0 (equity mai positiva): percentuale non definibile → punto a
 * -1 (fondo scala), coerente con la convenzione "equity negativa" del Max DD.
 */
export function underwaterSeries(
  daily: { day: string; netPnl: string }[],
  baseBalance: string,
): UnderwaterPoint[] {
  let equity = new Decimal(baseBalance);
  let peak = equity;
  const points: UnderwaterPoint[] = [];
  for (const row of daily) {
    equity = equity.plus(row.netPnl);
    if (equity.gt(peak)) peak = equity;
    let ddPct: Decimal;
    if (peak.lte(0)) {
      ddPct = new Decimal(-1);
    } else {
      ddPct = Decimal.max(
        -1,
        equity.minus(peak).div(peak),
      );
    }
    points.push({ day: row.day, ddPct: ddPct.toDecimalPlaces(4).toString() });
  }
  return points;
}

export const underwaterInfo: MetricInfoData = {
  label: "Underwater plot",
  description:
    "Quanto l'equity sta sotto il suo massimo storico, giorno per giorno: la profondità dei drawdown e quanto a lungo resti \"sott'acqua\" prima di recuperare. Zero = nuovo massimo. Calcolato sul P&L realizzato per giorno di chiusura: le escursioni dei trade aperti e intraday non sono incluse.",
  formula: "DD% del giorno = (equity − picco equity fino a quel giorno) / picco · sulle chiusure di giornata",
};
