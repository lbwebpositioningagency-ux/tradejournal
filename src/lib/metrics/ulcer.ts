import Decimal from "decimal.js";
import type { DailyPnl } from "./types";

/**
 * Ulcer Index sulla curva di equity GIORNALIERA (serie unica di
 * daily-series.ts, la stessa di maxDrawdown): misura profondità E durata dei
 * drawdown, non solo il punto peggiore. Le sedute feriali senza trade entrano
 * a P&L 0: contano nel denominatore N, perché "quanto a lungo resti
 * sott'acqua" si misura sul calendario di borsa, non sui soli giorni operativi.
 *
 *   UI = √( Σ dd%² / N )   con   dd% = (picco storico − equity) / picco
 *
 * dove dd% è la frazione di drawdown del giorno rispetto al massimo storico
 * di equity (0 nei giorni su nuovi massimi). Restituisce una FRAZIONE 0-1 a
 * 4 decimali (convenzione del modulo: ×100 solo in UI).
 *
 * - "0.0000" se la serie non ha mai un drawdown (zero legittimo);
 * - null se: nessun giorno, oppure un giorno in drawdown ha picco ≤ 0
 *   (percentuale non definibile — stessa distinzione di maxDrawdownPct).
 *
 * `days` in ordine cronologico crescente.
 */
export function ulcerIndex(
  days: Pick<DailyPnl, "netPnl">[],
  startingBalance = "0",
): string | null {
  if (days.length === 0) return null;

  let equity = new Decimal(startingBalance);
  let peak = equity;
  let squares = new Decimal(0);

  for (const day of days) {
    equity = equity.plus(day.netPnl);
    if (equity.gt(peak)) {
      peak = equity;
      continue;
    }
    if (equity.lt(peak)) {
      if (peak.lte(0)) return null;
      const dd = peak.minus(equity).div(peak);
      squares = squares.plus(dd.times(dd));
    }
  }

  return squares.div(days.length).sqrt().toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const ulcerInfo = {
  label: "Ulcer Index",
  description:
    "Misura il drawdown pesando anche quanto A LUNGO resti sott'acqua, non solo la profondità: più basso è, meno stress ha inflitto la curva di equity. Calcolato sul P&L realizzato per giorno di chiusura: le escursioni dei trade aperti e intraday non sono incluse.",
  formula: "UI = √( Σ dd%² / N ) · dd% = (picco storico − equity) / picco, per ogni giorno",
};
