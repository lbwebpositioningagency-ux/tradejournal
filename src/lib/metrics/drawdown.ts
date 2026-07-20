import Decimal from "decimal.js";
import type { DailyPnl, DrawdownResult } from "./types";

/**
 * Max Drawdown sulla curva di equity GIORNALIERA:
 * equity(g) = saldo iniziale + P&L netto cumulato fino al giorno g.
 *
 * La scansione avviene sulla serie dei giorni (≤ ~365 punti), non sui singoli
 * trade: la serie arriva già aggregata dal SQL (getDailyPnl).
 *
 * - maxDrawdown: distanza massima dal picco precedente ($, positiva);
 * - maxDrawdownPct: frazione del picco di equity al momento del picco.
 *   "0.0000" se non c'è alcun drawdown (percentuale definita e pari a zero);
 *   null SOLO se un drawdown esiste ma il picco è ≤ 0 (percentuale non
 *   definibile). La distinzione conta per compositeScore: zero drawdown vale
 *   punteggio risk pieno, null vale il neutro;
 * - date: il giorno in cui si tocca il punto più profondo;
 * - avgDrawdown: media delle profondità nei soli giorni in drawdown.
 *
 * `days` deve essere in ordine cronologico crescente.
 */
export function maxDrawdown(
  days: DailyPnl[],
  startingBalance = "0",
): DrawdownResult {
  let equity = new Decimal(startingBalance);
  let peak = equity;

  let worst = new Decimal(0);
  let worstPct: Decimal | null = null;
  let worstDate: string | null = null;

  let ddSum = new Decimal(0);
  let ddDays = 0;

  for (const day of days) {
    equity = equity.plus(day.netPnl);
    if (equity.gt(peak)) {
      peak = equity;
      continue;
    }
    const depth = peak.minus(equity);
    if (depth.gt(0)) {
      ddSum = ddSum.plus(depth);
      ddDays += 1;
      if (depth.gt(worst)) {
        worst = depth;
        worstDate = day.day;
        worstPct = peak.gt(0) ? depth.div(peak) : null;
      }
    }
  }

  return {
    maxDrawdown: worst.toFixed(2),
    maxDrawdownPct: worst.isZero()
      ? "0.0000"
      : worstPct
        ? worstPct.toFixed(4)
        : null,
    date: worstDate,
    avgDrawdown: ddDays === 0 ? "0.00" : ddSum.div(ddDays).toFixed(2),
  };
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const maxDrawdownInfo = {
  label: "Max Drawdown",
  description:
    "La discesa più profonda della curva di equity giornaliera dal suo picco: misura il rischio storico che hai davvero sopportato, in valuta e in % del picco.",
  formula: "MaxDD = max(picco equity − equity) · % = MaxDD / picco al momento del massimo",
};
