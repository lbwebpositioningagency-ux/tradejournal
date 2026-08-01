import Decimal from "decimal.js";
import type { MetricInfoData, RSplitAggregates } from "./types";

/** Profitto medio dei trade vincenti (scala 2); null senza vincenti. */
export function avgWin(winSum: string, wins: number): string | null {
  if (wins === 0) return null;
  return new Decimal(winSum).div(wins).toFixed(2);
}

/**
 * Perdita media dei trade perdenti, come GRANDEZZA positiva (scala 2);
 * null senza perdenti. `lossSum` arriva col segno (≤ 0).
 */
export function avgLoss(lossSum: string, losses: number): string | null {
  if (losses === 0) return null;
  return new Decimal(lossSum).abs().div(losses).toFixed(2);
}

/** Rapporto Avg Win / Avg Loss (scala 4); null se una delle due manca. */
export function payoffRatio(
  avgWinValue: string | null,
  avgLossValue: string | null,
): string | null {
  if (avgWinValue === null || avgLossValue === null) return null;
  const loss = new Decimal(avgLossValue);
  if (loss.isZero()) return null;
  return new Decimal(avgWinValue).div(loss).toFixed(4);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const avgWinLossInfo = {
  label: "Avg Win / Avg Loss",
  description:
    "Profitto medio dei trade vincenti contro perdita media dei perdenti: dice se quando hai ragione guadagni più di quanto perdi quando hai torto (payoff ratio = rapporto tra i due).",
  formula: "AvgWin = Σ profitti / n° win · AvgLoss = |Σ perdite| / n° loss · Payoff = AvgWin / AvgLoss",
};

// ── versioni in R: la colonna standard delle tabelle di breakdown ────────

/**
 * `Avg Win/Loss` in unità R: (media degli R vincenti) / (media degli |R|
 * perdenti), scala 4.
 *
 * Perché in R e non in valuta: la colonna vive in tabelle che possono
 * aggregare conti in valute diverse, e un rapporto fra medie in valuta lì
 * non ha significato (stessa ragione per cui l'Expectancy di queste tabelle
 * è in R). L'R è adimensionale e resta confrontabile ovunque.
 *
 * Senza vincenti O senza perdenti il rapporto non è definito → null (mai 0,
 * mai Infinity): la UI mostra "—".
 */
export function avgWinLossR(agg: RSplitAggregates): string | null {
  if (agg.rWinCount === 0 || agg.rLossCount === 0) return null;
  const avgWinR = new Decimal(agg.rWinSum).div(agg.rWinCount);
  const avgLossR = new Decimal(agg.rLossSum).abs().div(agg.rLossCount);
  if (avgLossR.isZero()) return null;
  return avgWinR.div(avgLossR).toFixed(4);
}

export const avgWinLossRInfo: MetricInfoData = {
  label: "Avg Win / Avg Loss",
  description:
    "Quanto è grande la vincita media rispetto alla perdita media, misurate in R: sopra 1 quando hai ragione guadagni più di quanto perdi quando hai torto. In R e non in valuta, così il rapporto resta leggibile anche quando la riga mette insieme conti diversi.",
  formula:
    "Avg Win/Loss = (Σ R>0 / n° R>0) / (|Σ R<0| / n° R<0) · solo trade con rischio definito",
};

/**
 * Expectancy in R della riga: media dell'R realizzato su TUTTI i trade
 * chiusi con rischio definito (vincite e perdite insieme). È il numero che
 * fino alla Fase 60 si chiamava "R medio": stesso calcolo, etichetta nuova.
 *
 * Unica implementazione: prima viveva copiata in reports/page.tsx,
 * performance-bar-table.tsx e segment-performance.ts.
 */
export function avgR(rSum: string, rCount: number): string | null {
  if (rCount === 0) return null;
  return new Decimal(rSum).div(rCount).toFixed(4);
}

export const avgRInfo: MetricInfoData = {
  label: "Expectancy",
  description: "Media del multiplo R realizzato su tutti i trade chiusi.",
  formula:
    "Expectancy = Σ R-multiple / n° trade con rischio definito · R = netPnl / rischio iniziale",
};
