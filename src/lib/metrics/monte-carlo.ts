/**
 * Primitive condivise del Monte Carlo: RNG deterministico e soglia minima
 * di campione.
 *
 * STORIA (Fase 26): qui viveva `monteCarloR`, la proiezione W4 del widget
 * di dashboard — fascia sintetica dei prossimi 100 trade in R cumulati. Il
 * widget è stato rimosso: la dashboard mostra cosa è successo, non
 * proiezioni ipotetiche, e la versione completa e configurabile vive in
 * `/analytics` (`monte-carlo-lab.ts`, che di questo modulo riusa RNG e
 * soglia — è il motivo per cui il file resta).
 */

/** Minimo di R storici per una proiezione onesta (stessa soglia dell'SQN). */
export const MONTE_CARLO_MIN_TRADES = 30;

/** RNG deterministico (mulberry32), lo stesso schema del seed del progetto. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
