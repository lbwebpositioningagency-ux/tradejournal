import Decimal from "decimal.js";
import type { TradeAggregates } from "./types";

/**
 * Expectancy = (Win% × AvgWin) − (Loss% × AvgLoss), in valuta (scala 2).
 *
 * I breakeven contano nel totale (diluiscono i tassi) ma non nelle medie.
 * Equivale a netPnl/total, ma la teniamo nella forma della definizione per
 * aderenza alla specifica. Zero trade → null.
 */
export function expectancy(
  agg: Pick<TradeAggregates, "total" | "wins" | "losses" | "winSum" | "lossSum">,
): string | null {
  if (agg.total === 0) return null;

  const total = new Decimal(agg.total);
  const winTerm =
    agg.wins === 0
      ? new Decimal(0)
      : new Decimal(agg.wins)
          .div(total)
          .times(new Decimal(agg.winSum).div(agg.wins));
  const lossTerm =
    agg.losses === 0
      ? new Decimal(0)
      : new Decimal(agg.losses)
          .div(total)
          .times(new Decimal(agg.lossSum).abs().div(agg.losses));

  return winTerm.minus(lossTerm).toFixed(2);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const expectancyInfo = {
  label: "Expectancy",
  description:
    "Quanto ti aspetti di guadagnare (o perdere) in media da ogni trade: se è positiva, nel lungo periodo il sistema paga; equivale al P&L netto diviso i trade.",
  formula: "Expectancy = (Win% × AvgWin) − (Loss% × AvgLoss)",
};
