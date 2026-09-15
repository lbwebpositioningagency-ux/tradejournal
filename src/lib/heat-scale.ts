/**
 * Scala condivisa delle MAPPE A INTENSITÀ del journal: calendario mensile
 * (/day), griglia dei rendimenti mensili e mini-calendario della Dashboard.
 *
 * Tinte piene e opache (`--heat-{profit,loss}-{1,2,3}` in globals.css), non
 * più il token P&L velato al 10/20/30%: con la velatura la croma massima era
 * quella del colore di TESTO, che per reggere 4,5:1 sulla card è per forza
 * scuro (chiaro) o chiaro e poco saturo (scuro) — e le mappe risultavano
 * spente. Ogni coppia daltonica di Impostazioni ha i suoi valori.
 *
 * Il testo sopra le tinte usa i due token dedicati: `heat-foreground` per la
 * cifra, `heat-muted` per numero del giorno ed etichette. Il muted normale
 * del tema sulla tinta più forte scendeva a 2,99:1 (chiaro) e 3,81:1 (scuro).
 *
 * L'intensità NON si decide qui: la dà `returnIntensity` (soglie assolute in
 * frazione di equity, `src/lib/metrics/monthly-returns.ts`). Questo modulo
 * traduce solo il gradino in colore. Le classi sono stringhe letterali perché
 * Tailwind le trovi nel sorgente.
 */

export type HeatSign = "profit" | "loss";

const TINTE: Record<HeatSign, readonly [string, string, string]> = {
  profit: ["bg-heat-profit-1", "bg-heat-profit-2", "bg-heat-profit-3"],
  loss: ["bg-heat-loss-1", "bg-heat-loss-2", "bg-heat-loss-3"],
};

/** Classe di sfondo per segno e gradino (0 e 1 → primo gradino). */
export function heatTone(sign: HeatSign, tier: 0 | 1 | 2 | 3): string {
  return TINTE[sign][Math.max(1, tier) - 1];
}

/** Cifra sopra una tinta della scala. */
export const HEAT_TEXT = "text-heat-foreground";
/** Testo secondario (numero del giorno, etichetta del mese, conteggio). */
export const HEAT_TEXT_MUTED = "text-heat-muted";
