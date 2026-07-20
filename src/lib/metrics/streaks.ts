import Decimal from "decimal.js";
import type { DailyPnl, StreakResult, TradeOutcome } from "./types";
import { classifyOutcome } from "./outcome";

/**
 * Streak corrente su una sequenza di esiti ordinata dal PIÙ RECENTE al più
 * vecchio: conta gli esiti uguali consecutivi in testa.
 * Un breakeven in testa interrompe subito (direction "NONE").
 */
export function currentStreak(outcomes: TradeOutcome[]): StreakResult {
  if (outcomes.length === 0 || outcomes[0] === "BREAKEVEN") {
    return { direction: "NONE", length: 0 };
  }
  const direction = outcomes[0];
  let length = 0;
  for (const outcome of outcomes) {
    if (outcome !== direction) break;
    length += 1;
  }
  return { direction, length };
}

/** Streak di giornate: classifica ogni giorno dal suo P&L netto. */
export function currentDayStreak(
  daysMostRecentFirst: Pick<DailyPnl, "netPnl">[],
): StreakResult {
  return currentStreak(daysMostRecentFirst.map((d) => classifyOutcome(d.netPnl)));
}

export interface StreakSummary {
  maxWin: number;
  maxLoss: number;
  /** Lunghezza MEDIA delle serie di win (scala 1); null senza serie. */
  avgWin: string | null;
  /** Lunghezza MEDIA delle serie di loss (scala 1); null senza serie. */
  avgLoss: string | null;
}

/**
 * Riepilogo delle streak su una sequenza di esiti in ordine CRONOLOGICO
 * (dal più vecchio al più recente): serie massima E lunghezza media delle
 * serie consecutive, per win e loss. I breakeven spezzano entrambe.
 * Sequenza già ridotta (es. serie del grafico o bucket giornalieri):
 * mai liste illimitate di trade.
 */
export function streakSummary(outcomes: TradeOutcome[]): StreakSummary {
  const runs: Record<"WIN" | "LOSS", number[]> = { WIN: [], LOSS: [] };
  let current: TradeOutcome | null = null;
  let length = 0;

  const closeRun = () => {
    if ((current === "WIN" || current === "LOSS") && length > 0) {
      runs[current].push(length);
    }
  };

  for (const outcome of outcomes) {
    if (outcome === current) {
      length += 1;
      continue;
    }
    closeRun();
    current = outcome;
    length = 1;
  }
  closeRun();

  const avg = (list: number[]): string | null =>
    list.length === 0
      ? null
      : new Decimal(list.reduce((a, b) => a + b, 0)).div(list.length).toFixed(1);

  return {
    maxWin: runs.WIN.length ? Math.max(...runs.WIN) : 0,
    maxLoss: runs.LOSS.length ? Math.max(...runs.LOSS) : 0,
    avgWin: avg(runs.WIN),
    avgLoss: avg(runs.LOSS),
  };
}

/** streakSummary sulle giornate, classificate dal P&L netto (ordine cronologico). */
export function dayStreakSummary(
  daysChronological: Pick<DailyPnl, "netPnl">[],
): StreakSummary {
  return streakSummary(daysChronological.map((d) => classifyOutcome(d.netPnl)));
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const avgStreakInfo = {
  label: "Streak media",
  description:
    "Lunghezza media delle serie consecutive di vittorie (o sconfitte) nel periodo: dice quanto durano tipicamente i tuoi run, non solo il record.",
  formula: "Σ lunghezze delle serie / numero di serie (per direzione)",
};

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const streaksInfo = {
  label: "Streak",
  description:
    "Serie di trade (o giornate) consecutivi con lo stesso esito: utile per riconoscere run positivi e, soprattutto, sequenze di perdite da cui difendersi. Un breakeven interrompe la serie.",
  formula: "Conteggio consecutivo dello stesso esito dal trade/giorno più recente",
};
