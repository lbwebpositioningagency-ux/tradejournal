import Decimal from "decimal.js";
import { DAY_UNIT_NOTES } from "./day-vocabulary";
import type { DailyPnl } from "./types";

/**
 * Statistiche per GIORNATA (card "Best/Worst Days"): aggregati Decimal sulla
 * serie giornaliera già ridotta dal SQL (getDailyPnl, ≤365 bucket) — mai
 * liste di trade. I breakeven (P&L 0) non contano né tra i positivi né tra
 * i negativi.
 */

export interface DayStats {
  posDays: number;
  negDays: number;
  /** Giorno migliore/peggiore; null senza giorni di quel segno. */
  bestDay: { day: string; netPnl: string } | null;
  worstDay: { day: string; netPnl: string } | null;
  /** Media dei P&L dei giorni positivi (scala 2); null se nessuno. */
  avgPosDay: string | null;
  /** Media dei P&L dei giorni negativi (≤ 0, col segno, scala 2); null se nessuno. */
  avgNegDay: string | null;
}

export function dayStats(days: Pick<DailyPnl, "day" | "netPnl">[]): DayStats {
  let posDays = 0;
  let negDays = 0;
  let posSum = new Decimal(0);
  let negSum = new Decimal(0);
  let best: { day: string; netPnl: Decimal } | null = null;
  let worst: { day: string; netPnl: Decimal } | null = null;

  for (const d of days) {
    const pnl = new Decimal(d.netPnl);
    if (pnl.gt(0)) {
      posDays += 1;
      posSum = posSum.plus(pnl);
      if (!best || pnl.gt(best.netPnl)) best = { day: d.day, netPnl: pnl };
    } else if (pnl.lt(0)) {
      negDays += 1;
      negSum = negSum.plus(pnl);
      if (!worst || pnl.lt(worst.netPnl)) worst = { day: d.day, netPnl: pnl };
    }
  }

  return {
    posDays,
    negDays,
    bestDay: best ? { day: best.day, netPnl: best.netPnl.toFixed(2) } : null,
    worstDay: worst ? { day: worst.day, netPnl: worst.netPnl.toFixed(2) } : null,
    avgPosDay: posDays === 0 ? null : posSum.div(posDays).toFixed(2),
    avgNegDay: negDays === 0 ? null : negSum.div(negDays).toFixed(2),
  };
}

/** Testi per <MetricInfo>: tenuti accanto alla formula (vedi types.ts). */
export const dayCountInfo = {
  label: "Giornate operative positive / negative",
  description:
    "Quante giornate operative hai chiuso in verde e quante in rosso nel periodo: la consistenza giorno per giorno, al netto dei singoli trade.",
  formula:
    "Conteggio delle giornate operative con P&L netto > 0 (o < 0); i breakeven non contano",
  note: DAY_UNIT_NOTES.operative,
};

export const bestWorstDayInfo = {
  label: "Miglior / peggior giorno",
  description:
    "La giornata col P&L netto più alto e quella col più basso: quanto pesano gli estremi sul risultato del periodo.",
  formula: "max / min del P&L netto giornaliero",
};

export const avgDayInfo = {
  label: "Media giorni positivi / negativi",
  description:
    "P&L medio delle sole giornate in verde e delle sole giornate in rosso: se la media dei giorni buoni supera quella dei cattivi, le giornate ti pagano.",
  formula: "Σ P&L dei giorni di quel segno / numero di giorni di quel segno",
};
