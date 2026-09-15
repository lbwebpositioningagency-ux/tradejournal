/**
 * ACCENTO della griglia anni × periodo — quale casella merita colore.
 *
 * Prima ogni casella era un riquadro tinto con intensità proporzionale al
 * valore: a una scala che satura al 90° percentile, fra il 90 e il 98% delle
 * caselle risultava colorato (misurato il 15/09/2026 su sette strumenti e
 * cinque profondità) e il colore non distingueva più niente.
 *
 * Ora il colore è un ACCENTO, e le soglie vengono dalla distribuzione della
 * griglia stessa, non da una scala inventata:
 * - livello 0, ordinario: sotto il 75° percentile dello scarto assoluto → nessun colore;
 * - livello 1, notevole: dal 75° al 90° → cifra nel colore del segno;
 * - livello 2, forte: dal 90° in su → cifra nel colore del segno, in semibold.
 *
 * Lo scarto è dallo zero per i rendimenti e dalla mediana della finestra per i
 * livelli di volatilità, come nel resto della pagina. Per costruzione circa
 * tre caselle su quattro restano neutre, su ogni strumento e profondità.
 */

export type LivelloAccento = 0 | 1 | 2;

export interface SoglieAccento {
  notevole: number;
  forte: number;
}

export const QUANTILE_NOTEVOLE = 0.75;
export const QUANTILE_FORTE = 0.9;

function quantile(ordinati: number[], p: number): number {
  return ordinati[Math.min(ordinati.length - 1, Math.floor(ordinati.length * p))];
}

/**
 * Soglie dagli scarti di una griglia. Senza valori (o con tutti gli scarti a
 * zero) le soglie sono infinite: nessuna casella si colora, invece di colorarle
 * tutte per una divisione per zero.
 */
export function soglieAccento(scarti: readonly number[]): SoglieAccento {
  const abs = scarti
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .sort((a, b) => a - b);
  if (abs.length === 0) return { notevole: Infinity, forte: Infinity };
  const notevole = quantile(abs, QUANTILE_NOTEVOLE);
  const forte = quantile(abs, QUANTILE_FORTE);
  return {
    notevole: notevole > 0 ? notevole : Infinity,
    forte: forte > 0 ? forte : Infinity,
  };
}

/** Livello di una casella; uno scarto nullo o non finito è sempre ordinario. */
export function livelloAccento(scarto: number, soglie: SoglieAccento): LivelloAccento {
  if (!Number.isFinite(scarto) || scarto === 0) return 0;
  const a = Math.abs(scarto);
  if (a >= soglie.forte) return 2;
  if (a >= soglie.notevole) return 1;
  return 0;
}

/**
 * Classe CSS della casella (`listino.css`, blocco `.ml-griglia`): colore del
 * segno e peso vengono dal sistema, qui si sceglie solo quale.
 */
export function classeAccento(scarto: number, soglie: SoglieAccento): string | undefined {
  const livello = livelloAccento(scarto, soglie);
  if (livello === 0) return undefined;
  return `ml-acc-${scarto > 0 ? "su" : "giu"}${livello === 2 ? " ml-acc-forte" : ""}`;
}
