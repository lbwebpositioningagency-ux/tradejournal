/**
 * CALORE della griglia anni × periodo — quanto è tinta ogni casella.
 *
 * Storia breve, perché è la terza resa della stessa griglia:
 * - fino al 14/09/2026 ogni casella era un riquadro tinto fino al 52%: fra il 90
 *   e il 98% risultava colorato pieno, un muro di rettangoli;
 * - il 15/09/2026 (giro 5) il colore è diventato un accento sulla sola cifra, dal
 *   75° percentile: tre caselle su quattro senza colore, e la griglia aveva perso
 *   la lettura d'insieme che una heatmap deve dare;
 * - dal 16/09/2026 (giro 6, tavola «Sistema visivo v3 - Stagionalità, heatmap
 *   tenue», taratura P) il colore torna su TUTTE le caselle, tenue e graduale.
 *
 * La scala è PROPORZIONALE allo scarto e satura al 95° percentile dello scarto
 * della griglia stessa, in cinque passi: passo = ⌈5 · min(1, |scarto| / p95)⌉.
 * Tarata sulla distribuzione reale e non su valori fissi, vale uguale per l'oro,
 * il VIX e le ore dell'S&P. Misurato su 44 combinazioni strumento × profondità:
 * ai passi 1-2 finisce fra il 60 e l'89% delle caselle, al passo 5 fra il 5 e il
 * 15% — la maggior parte leggera, decisi solo gli estremi. I quinti della
 * distribuzione (taratura Q, scartata) coloravano deciso due caselle su cinque
 * per costruzione.
 *
 * Le percentuali di tinta per passo sono token del sistema (`--heat-1…5` in
 * `globals.css`, diverse per tema), il colore è quello del segno
 * (`--md-up`/`--md-down`, compresa la coppia daltonica): qui si decide solo il passo.
 */

export type PassoCalore = 1 | 2 | 3 | 4 | 5;

export const PASSI_CALORE = 5;
export const QUANTILE_SATURAZIONE = 0.95;

/**
 * Scarto assoluto oltre il quale la tinta è piena: il 95° percentile degli
 * scarti. Senza valori, o con tutti gli scarti a zero, restituisce 0: nessuna
 * casella si tinge, invece di tingerle tutte per una divisione per zero.
 */
export function saturazioneCalore(scarti: readonly number[]): number {
  const abs = scarti
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .sort((a, b) => a - b);
  if (abs.length === 0) return 0;
  return abs[Math.min(abs.length - 1, Math.floor(abs.length * QUANTILE_SATURAZIONE))];
}

/**
 * Passo di una casella; `null` = nessuna tinta (scarto nullo o non finito, o
 * griglia senza scala). Uno scarto minimo prende comunque il passo 1: la
 * griglia si legge come mappa anche dove i valori sono piccoli.
 */
export function passoCalore(scarto: number, saturazione: number): PassoCalore | null {
  if (!Number.isFinite(scarto) || scarto === 0) return null;
  if (!Number.isFinite(saturazione) || saturazione <= 0) return null;
  const t = Math.min(1, Math.abs(scarto) / saturazione);
  return Math.max(1, Math.ceil(PASSI_CALORE * t - 1e-9)) as PassoCalore;
}

/**
 * Attributi della casella per `listino.css` (blocco `.ml-griglia`): la classe
 * dice il segno, `data-calore` il passo. Colori e cifre li disegna il sistema.
 */
export function attributiCalore(
  scarto: number,
  saturazione: number,
): { className?: string; "data-calore"?: PassoCalore } {
  const passo = passoCalore(scarto, saturazione);
  if (passo === null) return {};
  return { className: scarto > 0 ? "ml-su" : "ml-giu", "data-calore": passo };
}
