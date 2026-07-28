import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — distribuzione dei ritorni per TARGET R.
 *
 * Modulo puro: riceve le righe già aggregate in SQL (una per bucket di target
 * R) e ne deriva le grandezze di lettura. Non ricalcola né l'R realizzato né
 * il target R: sono `Trade.rMultiple` e `Trade.targetR`, denormalizzati dalla
 * pipeline — qui si contano soltanto.
 *
 * Convenzioni del progetto: tassi come frazioni 0-1 a 4 decimali (il ×100 sta
 * in UI), "nessun dato" → null, mai uno 0 che sembra un risultato.
 */

export const TARGET_R_BUCKET_ORDER = ["le1", "1to2", "2to3", "gt3"] as const;
export type TargetRBucketKey = (typeof TARGET_R_BUCKET_ORDER)[number];

export const TARGET_R_BUCKET_LABELS: Record<TargetRBucketKey, string> = {
  le1: "≤ 1R",
  "1to2": "1-2R",
  "2to3": "2-3R",
  gt3: "> 3R",
};

/** Riga grezza dall'aggregazione SQL. */
export interface TargetRBucketInput {
  bucket: string;
  trades: number;
  hits: number;
  avgR: string | null;
  p25: string | null;
  p50: string | null;
  p75: string | null;
  minR: string | null;
  maxR: string | null;
  sumR: string | null;
}

export interface TargetRBucketStats {
  bucket: TargetRBucketKey;
  label: string;
  trades: number;
  hits: number;
  /** Frazione 0-1 dei trade usciti al target o oltre; null senza trade. */
  hitRate: string | null;
  /** R medio realizzato = expectancy in R del bucket; null senza trade. */
  expectancyR: string | null;
  p25: string | null;
  p50: string | null;
  p75: string | null;
  minR: string | null;
  maxR: string | null;
  /** Somma degli R del bucket: quanto ha prodotto davvero. */
  sumR: string | null;
}

function scale(value: string | null, decimals: number): string | null {
  if (value === null || value === "") return null;
  const dec = new Decimal(value);
  return dec.isFinite() ? dec.toFixed(decimals) : null;
}

/**
 * Riempie TUTTI i bucket nell'ordine canonico: un bucket senza trade compare
 * comunque, a zero e con le medie a null — così la tabella non "salta" fasce
 * e si vede subito dove il trader non ha mai puntato.
 */
export function targetRBucketStats(
  rows: TargetRBucketInput[],
): TargetRBucketStats[] {
  const byKey = new Map(rows.map((r) => [r.bucket, r]));
  return TARGET_R_BUCKET_ORDER.map((bucket) => {
    const row = byKey.get(bucket);
    const trades = row?.trades ?? 0;
    const hits = row?.hits ?? 0;
    return {
      bucket,
      label: TARGET_R_BUCKET_LABELS[bucket],
      trades,
      hits,
      hitRate:
        trades > 0
          ? new Decimal(hits).div(trades).toFixed(4)
          : null,
      expectancyR: trades > 0 ? scale(row?.avgR ?? null, 4) : null,
      p25: scale(row?.p25 ?? null, 4),
      p50: scale(row?.p50 ?? null, 4),
      p75: scale(row?.p75 ?? null, 4),
      minR: scale(row?.minR ?? null, 4),
      maxR: scale(row?.maxR ?? null, 4),
      sumR: scale(row?.sumR ?? null, 4),
    };
  });
}

/** Totali di riepilogo su tutti i bucket (i trade con piano valido). */
export interface TargetRTotals {
  trades: number;
  hits: number;
  hitRate: string | null;
  expectancyR: string | null;
  sumR: string | null;
}

export function targetRTotals(buckets: TargetRBucketStats[]): TargetRTotals {
  const trades = buckets.reduce((sum, b) => sum + b.trades, 0);
  const hits = buckets.reduce((sum, b) => sum + b.hits, 0);
  const sumR = buckets.reduce(
    (sum, b) => (b.sumR ? sum.plus(b.sumR) : sum),
    new Decimal(0),
  );
  return {
    trades,
    hits,
    hitRate: trades > 0 ? new Decimal(hits).div(trades).toFixed(4) : null,
    expectancyR: trades > 0 ? sumR.div(trades).toFixed(4) : null,
    sumR: trades > 0 ? sumR.toFixed(4) : null,
  };
}

/*
 * NOTA: l'istogramma per fasce di 0,5R NON si costruisce qui — esiste già
 * `fillRDistribution` in src/lib/reports.ts (widget F32), con le stesse
 * fasce, la stessa colonna BE dedicata e gli stessi overflow. La pagina
 * Analytics riusa quella: una fascia sola, non due che possono divergere.
 */

export const returnDistributionInfo: MetricInfoData = {
  label: "Distribuzione dell'R realizzato",
  description:
    "Come si distribuiscono i tuoi risultati in multipli del rischio. La forma conta più della media: una coda destra lunga dice che poche vincite grosse portano il conto, un ammasso appena sotto lo zero dice che le perdite sono controllate.",
  formula: "R realizzato = P&L netto / rischio iniziale · fasce da 0,5R",
};

export const targetRInfo: MetricInfoData = {
  label: "Target R",
  description:
    "Quanti multipli del rischio puntavi a incassare, secondo il piano scritto PRIMA di entrare. Calcolato sui prezzi pianificati: |target − ingresso| / |ingresso − stop|.",
  formula: "Target R = |target − entry| / |entry − stop| (segni per direzione)",
};

export const hitRateInfo: MetricInfoData = {
  label: "Hit rate",
  description:
    "Quante volte il prezzo ha davvero raggiunto il target pianificato. È un fatto di PREZZO, non di P&L: le commissioni non lo abbassano artificialmente. Puntare più lontano abbassa l'hit rate — la domanda è se il guadagno per trade lo compensa.",
  formula: "Hit rate = trade usciti al target o oltre / trade con piano valido",
};

export const expectancyRInfo: MetricInfoData = {
  label: "Expectancy in R",
  description:
    "Quanti multipli del rischio ti aspetti in media da ogni trade di questa fascia. È il numero che decide: un target ambizioso con hit rate basso può battere un target vicino con hit rate alto, o non farcela affatto.",
  formula: "Expectancy R = media dell'R realizzato dei trade della fascia",
};
