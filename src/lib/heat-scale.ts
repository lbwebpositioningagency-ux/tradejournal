/**
 * Scala condivisa delle MAPPE A INTENSITÀ del journal: calendario del mese e
 * griglia dei rendimenti mensili (Dashboard), pagina Settimana.
 *
 * Resa «vetro» (17/09/2026, tavola «Sistema visivo v3 - vetro, palette dei
 * dati»): riempimento opaco desaturato `bg-viz-{profit,loss}-{1,2,3}`, filo
 * traslucido della stessa tinta, riflesso dall'alto (`.viz-glass` in
 * globals.css) e un alone morbido sul gradino più intenso. Sostituisce le tinte
 * piene sature del 16/09. È la famiglia `--viz-*` dei DATI, separata dai token
 * semantici: la cifra sopra non è colorata, il segno lo porta il + o il −.
 *
 * Il testo sopra le tinte usa i due token dedicati: `viz-foreground` per la
 * cifra, `viz-muted` per numero del giorno ed etichette — il muted del tema
 * sulle tinte non regge 4,5:1.
 *
 * L'intensità NON si decide qui: la dà `returnIntensity` (soglie assolute in
 * frazione di equity, `src/lib/metrics/monthly-returns.ts`). Questo modulo
 * traduce solo il gradino in colore. Le classi sono stringhe letterali perché
 * Tailwind le trovi nel sorgente.
 */

export type HeatSign = "profit" | "loss";

const TINTE: Record<HeatSign, readonly [string, string, string]> = {
  profit: [
    "viz-glass bg-viz-profit-1 border-viz-profit-edge",
    "viz-glass bg-viz-profit-2 border-viz-profit-edge",
    "viz-glass viz-glow-profit bg-viz-profit-3 border-viz-profit-edge",
  ],
  loss: [
    "viz-glass bg-viz-loss-1 border-viz-loss-edge",
    "viz-glass bg-viz-loss-2 border-viz-loss-edge",
    "viz-glass viz-glow-loss bg-viz-loss-3 border-viz-loss-edge",
  ],
};

/**
 * Classi di riempimento, filo e riflesso per segno e gradino (0 e 1 → primo
 * gradino). Il chiamante mette `border` e NON un altro colore di bordo: il
 * filo della tinta fa parte del vetro.
 */
export function heatTone(sign: HeatSign, tier: 0 | 1 | 2 | 3): string {
  return TINTE[sign][Math.max(1, tier) - 1];
}

/** Cifra sopra una tinta della scala. */
export const HEAT_TEXT = "text-viz-foreground";
/** Testo secondario (numero del giorno, etichetta del mese, conteggio). */
export const HEAT_TEXT_MUTED = "text-viz-muted";
