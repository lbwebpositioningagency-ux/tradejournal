/**
 * MIGLIORE E PEGGIORE ANNO di ogni bucket — modulo PURO.
 *
 * Si leggono dalle osservazioni per (anno, bucket) che alimentano la heatmap
 * (`SeasonalityYearBucketObs`), sulla finestra di anni scelta: sono le stesse
 * caselle che si vedono in griglia, quindi il «migliore» della tabella è
 * sempre una casella che si può ritrovare sopra.
 *
 * Per un indice di volatilità «migliore» non vuol dire niente: la pagina lo
 * chiama massimo e minimo. Il calcolo è lo stesso.
 */

export interface OsservazioneAnno {
  year: number;
  bucket: number;
  value: number;
}

export interface EstremoAnno {
  valore: number;
  anno: number;
}

export interface EstremiBucket {
  bucket: number;
  migliore: EstremoAnno;
  peggiore: EstremoAnno;
  /** Anni che hanno un'osservazione in questo bucket nella finestra. */
  n: number;
}

/**
 * Massimo e minimo per bucket fra `from` e `to` compresi. A parità di valore
 * vince l'anno più recente, così il risultato non dipende dall'ordine delle
 * righe lette dal database.
 */
export function estremiPerBucket(
  osservazioni: readonly OsservazioneAnno[],
  from: number,
  to: number,
): Map<number, EstremiBucket> {
  const out = new Map<number, EstremiBucket>();
  for (const o of osservazioni) {
    if (o.year < from || o.year > to || !Number.isFinite(o.value)) continue;
    const cur = out.get(o.bucket);
    if (!cur) {
      out.set(o.bucket, {
        bucket: o.bucket,
        migliore: { valore: o.value, anno: o.year },
        peggiore: { valore: o.value, anno: o.year },
        n: 1,
      });
      continue;
    }
    cur.n += 1;
    if (o.value > cur.migliore.valore || (o.value === cur.migliore.valore && o.year > cur.migliore.anno)) {
      cur.migliore = { valore: o.value, anno: o.year };
    }
    if (o.value < cur.peggiore.valore || (o.value === cur.peggiore.valore && o.year > cur.peggiore.anno)) {
      cur.peggiore = { valore: o.value, anno: o.year };
    }
  }
  return out;
}
