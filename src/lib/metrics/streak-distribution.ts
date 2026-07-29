import Decimal from "decimal.js";
import type { MetricInfoData, TradeOutcome } from "./types";

/**
 * §3 — DISTRIBUZIONE DELLE LUNGHEZZE DI STREAK.
 *
 * Il riepilogo esistente (`streaks.ts`) dà la serie massima e quella media.
 * Qui si guarda la FORMA: quante volte è capitata una serie da 2, da 3, da
 * 7. E soprattutto si risponde alla domanda che uno si fa davvero dopo sei
 * perdite di fila — «è successo qualcosa al mio trading, o è normale?» —
 * confrontando la serie peggiore osservata con quella ATTESA per puro caso
 * su un campione di quella dimensione e con quel win rate.
 */

export interface StreakRun {
  outcome: "WIN" | "LOSS";
  /** Lunghezza della serie. */
  length: number;
  /** Quante volte una serie di questa lunghezza si è ripetuta. */
  count: number;
}

export interface StreakBar {
  length: number;
  wins: number;
  losses: number;
}

export interface StreakDistribution {
  bars: StreakBar[];
  longestWin: number;
  longestLoss: number;
  /** Serie totali osservate, per direzione. */
  winRuns: number;
  lossRuns: number;
}

/**
 * Riorganizza le serie (conteggi per lunghezza, calcolati in SQL) in barre
 * affiancate win/loss. Le lunghezze intermedie mancanti vengono riempite a
 * zero: un buco nel mezzo dell'istogramma è un'informazione ("da me non
 * capita mai una serie da 4"), una barra assente sposterebbe le altre e
 * mentirebbe sulla forma.
 */
export function streakDistribution(runs: StreakRun[]): StreakDistribution {
  if (runs.length === 0) {
    return { bars: [], longestWin: 0, longestLoss: 0, winRuns: 0, lossRuns: 0 };
  }

  const max = Math.max(...runs.map((r) => r.length));
  const byKey = new Map(runs.map((r) => [`${r.outcome}:${r.length}`, r.count]));

  const bars: StreakBar[] = [];
  for (let length = 1; length <= max; length++) {
    bars.push({
      length,
      wins: byKey.get(`WIN:${length}`) ?? 0,
      losses: byKey.get(`LOSS:${length}`) ?? 0,
    });
  }

  const longest = (outcome: TradeOutcome) =>
    runs
      .filter((r) => r.outcome === outcome && r.count > 0)
      .reduce((acc, r) => Math.max(acc, r.length), 0);
  const total = (outcome: TradeOutcome) =>
    runs
      .filter((r) => r.outcome === outcome)
      .reduce((acc, r) => acc + r.count, 0);

  return {
    bars,
    longestWin: longest("WIN"),
    longestLoss: longest("LOSS"),
    winRuns: total("WIN"),
    lossRuns: total("LOSS"),
  };
}

/**
 * Lunghezza ATTESA della serie più lunga in `trades` prove indipendenti con
 * probabilità `probability` per l'esito considerato:
 *
 *   E[L] ≈ ln(n · (1 − p)) / ln(1 / p)
 *
 * È l'approssimazione classica sulle sequenze di Bernoulli. Serve come
 * termine di paragone, non come verdetto: assume trade INDIPENDENTI, che è
 * proprio l'ipotesi che una serie anomala mette in dubbio. Se la serie
 * osservata è vicina all'attesa, il caso basta a spiegarla.
 *
 * null se p non è in (0,1) o senza trade: la formula non è definita.
 */
export function expectedLongestRun(
  trades: number,
  probability: string,
): string | null {
  const p = new Decimal(probability);
  if (trades <= 0 || p.lte(0) || p.gte(1)) return null;
  const expected = new Decimal(trades)
    .times(new Decimal(1).minus(p))
    .ln()
    .div(new Decimal(1).div(p).ln());
  return Decimal.max(expected, 0).toFixed(1);
}

export const streakDistributionInfo: MetricInfoData = {
  label: "Distribuzione delle streak",
  description:
    "Quante volte capitano serie di 2, 3, 5 trade consecutivi dello stesso segno, e quanto è lunga la serie peggiore rispetto a quella che il puro caso produrrebbe con il tuo win rate. Una serie di perdite dentro l'attesa non è un segnale di allarme: è la normale conseguenza di operare, e reagirci cambiando sistema è il modo più comune per peggiorare.",
  formula:
    "Conteggio delle serie consecutive per lunghezza · attesa ≈ ln(n·(1−p)) / ln(1/p)",
};
