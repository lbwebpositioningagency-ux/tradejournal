import Decimal from "decimal.js";
import type { TradeOutcome } from "./types";

/** Classifica l'esito di un trade dal suo netPnl: 0 esatto = breakeven. */
export function classifyOutcome(netPnl: string): TradeOutcome {
  const value = new Decimal(netPnl);
  if (value.isZero()) return "BREAKEVEN";
  return value.gt(0) ? "WIN" : "LOSS";
}
