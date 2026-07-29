import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — CONCENTRAZIONE TOP-N: quanta parte del profitto lordo arriva dai
 * pochi trade migliori.
 *
 * La domanda a cui risponde è scomoda e per questo utile: se togli i tre
 * trade più belli dell'anno, il sistema è ancora profittevole? Un edge
 * distribuito su molti trade è ripetibile; un profitto che sta tutto in due
 * operazioni è, con ottima probabilità, fortuna — e la statistica su tutto
 * il resto sta misurando rumore.
 */

export interface ConcentrationInput {
  /** Somma dei netPnl dei primi N vincenti (per N = 1, 3, 5, 10). */
  top1: string | null;
  top3: string | null;
  top5: string | null;
  top10: string | null;
  /** Somma dei primi 10% dei vincenti (decile superiore). */
  topDecile: string | null;
  /** Profitto lordo: somma di TUTTI i netPnl positivi. */
  grossProfit: string;
  /** Numero di trade vincenti nello scope. */
  winners: number;
  /** P&L netto complessivo (vincenti + perdenti), per il "senza i top". */
  netPnl: string;
}

export interface ConcentrationSlice {
  label: string;
  /** Numero di trade nel gruppo. */
  trades: number;
  /** Quota del profitto lordo, frazione 0-1; null se non calcolabile. */
  share: string | null;
  /** P&L netto complessivo TOLTI questi trade. */
  netWithout: string;
  /** True se togliendoli il periodo va in perdita. */
  flipsToLoss: boolean;
}

export interface Concentration {
  slices: ConcentrationSlice[];
  winners: number;
  grossProfit: string;
}

/**
 * Le fasce fisse (1, 3, 5, 10) e il decile superiore convivono di proposito:
 * i numeri fissi sono immediati da leggere ("i tuoi 3 trade migliori"), il
 * decile è l'unico confrontabile fra periodi con campioni diversi — il 10%
 * di 40 trade e il 10% di 400 sono la stessa domanda, "i tre migliori" no.
 */
export function concentration(input: ConcentrationInput): Concentration {
  const gross = new Decimal(input.grossProfit);
  const net = new Decimal(input.netPnl);

  const slice = (
    label: string,
    trades: number,
    sum: string | null,
  ): ConcentrationSlice | null => {
    // Un gruppo più grande del numero di vincenti non è un dato: sarebbe lo
    // stesso gruppo con un'etichetta diversa.
    if (sum === null || trades <= 0 || trades > input.winners) return null;
    const netWithout = net.minus(sum);
    return {
      label,
      trades,
      share: gross.isZero() ? null : new Decimal(sum).div(gross).toFixed(4),
      netWithout: netWithout.toFixed(2),
      flipsToLoss: net.gt(0) && netWithout.lte(0),
    };
  };

  const decileSize = Math.ceil(input.winners * 0.1);
  const fixed = [
    slice("Miglior trade", 1, input.top1),
    slice("Top 3", 3, input.top3),
    slice("Top 5", 5, input.top5),
    slice("Top 10", 10, input.top10),
  ].filter((s): s is ConcentrationSlice => s !== null);

  // Il decile si aggiunge solo se è un gruppo DIVERSO da quelli fissi: con 96
  // vincenti il 10% sono 10 trade, e ripetere la stessa riga con un'altra
  // etichetta fa sembrare due misure ciò che è una sola.
  const decile =
    fixed.some((s) => s.trades === decileSize)
      ? null
      : slice(`Top 10% (${decileSize})`, decileSize, input.topDecile);

  const slices = decile ? [...fixed, decile] : fixed;

  return { slices, winners: input.winners, grossProfit: input.grossProfit };
}

export const concentrationInfo: MetricInfoData = {
  label: "Concentrazione del profitto",
  description:
    "Quanta parte del profitto lordo viene dai pochi trade migliori, e cosa resterebbe togliendoli. Serve a distinguere un edge ripetibile da un risultato che sta in piedi grazie a due operazioni fortunate: se togliendo i tuoi tre trade migliori il periodo va in perdita, tutte le altre statistiche stanno descrivendo rumore.",
  formula: "Quota = Σ netPnl dei primi N vincenti / Σ di tutti i netPnl positivi",
};
