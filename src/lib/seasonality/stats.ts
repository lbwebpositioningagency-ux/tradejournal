/**
 * Kernel statistico della Stagionalità — modulo PURO, nessuna dipendenza da
 * rete, database o React: si testa con array di numeri.
 *
 * Perché `number` e non `Decimal`, in deroga apparente alla regola del
 * progetto: qui non si contabilizza denaro dell'utente ma si descrive un
 * campione. Media, deviazione standard e quantili di rendimenti LOGARITMICI
 * sono per costruzione irrazionali — nessuna precisione decimale è
 * conservabile e fingere il contrario darebbe una falsa esattezza. Il
 * confine è netto: i PREZZI stanno in `Decimal(18,8)` nel database (barre
 * grezze) e le statistiche ci tornano come `Decimal(18,8)` una volta
 * calcolate; il float vive solo dentro questo modulo.
 *
 * Regola di onestà applicata ovunque: quando una statistica NON è definita
 * si restituisce `null`, mai uno zero di comodo. Zero è un'informazione
 * ("il campione dice zero"), null è un'altra ("non lo sappiamo").
 */

/** Statistiche di un bucket stagionale. Mostrate SEMPRE tutte insieme. */
export interface BucketStats {
  /** Numerosità: il metro dell'affidabilità, mai nascosto. */
  n: number;
  mean: number;
  median: number;
  /** Campionaria (n-1). `null` con n < 2: con un'osservazione non c'è dispersione. */
  stdev: number | null;
  /** Quota di osservazioni che soddisfano il predicato (0-1). */
  positiveShare: number;
  p25: number;
  p75: number;
}

/**
 * Soglie di allerta sulla numerosità. Un valore stagionale calcolato su
 * poche osservazioni non è "quasi buono": è rumore con una media sopra.
 * Le due soglie separano «leggi con cautela» da «non ci basare nulla».
 */
export const LOW_SAMPLE_WARN = 12;
export const LOW_SAMPLE_CRITICAL = 5;

export type SampleQuality = "ok" | "low" | "critical";

export function sampleQuality(n: number): SampleQuality {
  if (n < LOW_SAMPLE_CRITICAL) return "critical";
  if (n < LOW_SAMPLE_WARN) return "low";
  return "ok";
}

/**
 * Quantile con interpolazione lineare sull'array ORDINATO (metodo 7 di
 * Hyndman-Fan, lo stesso di `percentile_cont` in Postgres e del default di
 * R/NumPy: così un controllo incrociato in SQL dà lo stesso numero).
 * L'array DEVE essere già ordinato: ordinare qui dentro nasconderebbe una
 * copia O(n log n) per ogni quantile richiesto.
 */
export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function mean(values: number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Deviazione standard CAMPIONARIA (denominatore n-1). Calcolata in due
 * passate: la formula "somma dei quadrati meno quadrato della somma" perde
 * cifre significative quando la media è grande rispetto alla dispersione —
 * esattamente il caso degli indici di volatilità (livelli attorno a 20 con
 * scarti di 0,3), dove può restituire una varianza negativa.
 */
export function stdevSample(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/**
 * Descrive un campione. `isPositive` decide cosa conta come "esito
 * favorevole": per i rendimenti è `v > 0` (hit rate), per i livelli di
 * volatilità è "sopra la mediana di lungo periodo" — un hit rate sul livello
 * di un indice di volatilità non vorrebbe dire niente.
 *
 * Restituisce `null` sul campione vuoto: nessuna riga inventata a zero.
 * I valori non finiti (NaN, ±Infinity) sono scartati PRIMA: entrano dal
 * calcolo dei rendimenti quando una fonte pubblica un prezzo a zero.
 */
export function describeSample(
  values: number[],
  isPositive: (value: number) => boolean = (v) => v > 0,
): BucketStats | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  let positives = 0;
  for (const v of clean) if (isPositive(v)) positives += 1;
  return {
    n: clean.length,
    mean: mean(clean),
    median: quantileSorted(sorted, 0.5),
    stdev: stdevSample(clean),
    positiveShare: positives / clean.length,
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
  };
}
