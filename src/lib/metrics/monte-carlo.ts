/**
 * RNG deterministico condiviso dalle simulazioni.
 *
 * STORIA: qui viveva `monteCarloR` (widget W4 di dashboard, rimosso in Fase
 * 26); il Monte Carlo a bande percentili di /analytics (`monte-carlo-lab.ts`)
 * è stato a sua volta sostituito in Fase 34 dall'equity curve simulator
 * (`equity-simulator.ts`), che di questo modulo riusa l'RNG — è il motivo
 * per cui il file resta.
 */

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
