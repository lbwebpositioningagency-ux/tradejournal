import Decimal from "decimal.js";
import { avgLoss, avgWin, payoffRatio } from "./averages";
import { breakEvenWinRate } from "./break-even";
import {
  ESTIMATE_MIN_TRADES,
  meanEstimate,
  parseUnits,
  winRateEstimate,
  type Estimate,
} from "./confidence";

/**
 * Le tre stime di un gruppo di trade (una riga di Reports, o il conto intero)
 * con i loro intervalli: win rate, expectancy in R, expectancy in valuta.
 *
 * Il win rate si confronta con il win rate di PAREGGIO del gruppo — quello che
 * con il suo payoff lascerebbe il conto a zero — perché distinguerlo «da zero»
 * non dice nulla. Le due expectancy si confrontano con lo zero.
 *
 * L'expectancy in R ha un campione proprio: i soli trade con rischio definito.
 * Un gruppo può avere 80 trade e 12 con R: la stima in valuta c'è, quella in
 * R dichiara il suo campione insufficiente.
 */

export interface GroupAggregates {
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  winSum: string;
  lossSum: string;
  pnlUnits: string[];
  rUnits: string[];
}

export interface GroupEstimates {
  n: number;
  /** Sotto soglia per TUTTE le stime basate sul conteggio dei trade. */
  lowSample: boolean;
  winRate: Estimate;
  expectancyR: Estimate;
  expectancyCash: Estimate;
  /** Win rate di pareggio usato come riferimento; null se non definibile. */
  breakEven: string | null;
}

export function groupEstimates(row: GroupAggregates): GroupEstimates {
  const payoff = payoffRatio(avgWin(row.winSum, row.wins), avgLoss(row.lossSum, row.losses));
  const beShare = row.total > 0 ? new Decimal(row.breakevens).div(row.total).toFixed(4) : null;
  const breakEven = breakEvenWinRate(payoff, beShare);
  return {
    n: row.total,
    lowSample: row.total < ESTIMATE_MIN_TRADES,
    winRate: winRateEstimate(row.wins, row.total, breakEven),
    expectancyR: meanEstimate(parseUnits(row.rUnits), 10000),
    expectancyCash: meanEstimate(parseUnits(row.pnlUnits), 100),
    breakEven,
  };
}
