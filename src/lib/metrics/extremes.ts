import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * ELEZIONE DEL MIGLIORE E DEL PEGGIORE FRA SOTTOGRUPPI — una regola sola.
 *
 * «L'ora migliore», «il giorno peggiore»: un'etichetta del genere è un
 * verdetto, e prima si dava anche a una fascia con un solo trade fortunato.
 * Sotto una soglia di campione la fascia resta visibile con i suoi numeri e il
 * suo n, ma non può ricevere l'etichetta: un valore estremo su pochi trade è
 * quasi sempre il caso, e il caso ha sempre la sua fascia migliore.
 *
 * SOGLIA: 30 trade per gruppo. Non è un numero magico, è il punto sotto cui
 * nessuna delle stime che l'etichetta riassume regge:
 *  - un win rate su 30 trade ha un intervallo al 95% di circa ±17 punti;
 *  - su SIM1 (623 trade) le 24 fasce orarie vanno da 7 a 64 trade, e con 24
 *    fasce al livello del 5% ci si aspetta più di una «migliore» per caso;
 *  - è lo stesso minimo che gli intervalli di confidenza richiedono per
 *    gruppo: la stessa soglia vale per l'elezione e per l'intervallo.
 *
 * Servono inoltre ALMENO DUE gruppi eleggibili (con uno solo «migliore» e
 * «peggiore» sono la stessa cosa) e un migliore strettamente sopra il
 * peggiore (a pari valore nessuno dei due è estremo).
 */
export const EXTREME_MIN_TRADES = 30;

export interface Extremes<T> {
  best: T | null;
  worst: T | null;
  /** Gruppi con almeno la soglia di trade e un valore definito. */
  eligible: number;
  /** Gruppi con almeno un trade (quelli che il lettore vede). */
  withTrades: number;
}

export function electExtremes<T>(
  groups: readonly T[],
  accessors: {
    trades: (g: T) => number;
    /** Valore da confrontare; null = non definito (es. nessun R). */
    value: (g: T) => string | null;
  },
  minTrades: number = EXTREME_MIN_TRADES,
): Extremes<T> {
  const withTrades = groups.filter((g) => accessors.trades(g) > 0).length;
  const usable = groups.filter(
    (g) => accessors.trades(g) >= minTrades && accessors.value(g) !== null,
  );
  const empty = { best: null, worst: null, eligible: usable.length, withTrades };
  if (usable.length < 2) return empty;

  let best = usable[0];
  let worst = usable[0];
  for (const g of usable) {
    const v = new Decimal(accessors.value(g)!);
    if (v.gt(accessors.value(best)!)) best = g;
    if (v.lt(accessors.value(worst)!)) worst = g;
  }
  if (!new Decimal(accessors.value(best)!).gt(accessors.value(worst)!)) return empty;
  return { best, worst, eligible: usable.length, withTrades };
}

/** Il gruppo può ricevere l'etichetta di migliore o peggiore? */
export function isExtremeEligible(trades: number, minTrades = EXTREME_MIN_TRADES): boolean {
  return trades >= minTrades;
}

export const extremesInfo: MetricInfoData = {
  label: "Migliore e peggiore",
  description:
    "Un gruppo (ora, giorno, sessione, durata) può essere chiamato migliore o peggiore solo con almeno 30 trade. Sotto resta visibile con i suoi numeri, ma senza etichetta: con pochi trade il valore più alto è quasi sempre fortuna, e fra tante fasce una fortunata c'è sempre.",
  formula: "Eleggibile = almeno 30 trade nel gruppo · servono almeno due gruppi eleggibili",
};
