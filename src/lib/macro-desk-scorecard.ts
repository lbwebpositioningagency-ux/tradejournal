import Decimal from "decimal.js";
import { MACRO_BIASES, type MacroBias } from "@/lib/validations/macro-desk";

/**
 * Scorecard Macro Desk: misura, con numeri, se i bias ci prendono.
 *
 * REGOLA DI RISOLUZIONE (ex ante, definita dal sistema esterno — non
 * modificarla): un bias si valuta close-to-close tra il prezzo del suo report
 * e il prezzo del report SUCCESSIVO DELLO STESSO TIPO che ha un prezzo
 * (DAILY→DAILY, WEEKLY→WEEKLY). RIALZISTA è corretto se la variazione è
 * positiva, RIBASSISTA se negativa; NEUTRALE se |variazione| ≤ soglia asset:
 * XAU 0,5% · WTI 1,0% · IDX 0,5%. I report senza prezzo (storici, pre
 * 23/07/2026) sono esclusi senza errori.
 *
 * Convenzioni del modulo:
 * - prezzi e variazioni viaggiano come stringhe decimali, i confronti sono
 *   Decimal (mai float: le soglie esatte al limite devono essere esatte);
 * - mai percentuali senza conteggio: ogni tasso è { hits, total };
 * - Brier score calcolato solo da BRIER_MIN_SAMPLES valutazioni in su
 *   (sotto, il numero sarebbe rumore mostrato con troppa sicurezza).
 */

export const SCORECARD_ASSETS = ["xau", "wti", "idx"] as const;
export type ScorecardAsset = (typeof SCORECARD_ASSETS)[number];

export const ASSET_LABELS: Record<ScorecardAsset, string> = {
  xau: "Oro (XAUUSD)",
  wti: "Petrolio (WTI)",
  idx: "Indici (S&P 500)",
};

/** Soglie di "piatto" come frazione del prezzo di partenza. */
export const ASSET_THRESHOLDS: Record<ScorecardAsset, string> = {
  xau: "0.005",
  wti: "0.01",
  idx: "0.005",
};

export const BRIER_MIN_SAMPLES = 20;

/** Esito realizzato, partizione a 3 vie con la soglia dell'asset. */
export const OUTCOMES = ["RIALZO", "RIBASSO", "PIATTO"] as const;
export type ScorecardOutcome = (typeof OUTCOMES)[number];

export type ScorecardReportType = "DAILY" | "WEEKLY";

/** Riga del report come arriva dalla query (prezzi già estratti dal payload). */
export interface ScorecardReportRow {
  id: string;
  type: ScorecardReportType;
  /** "YYYY-MM-DD" (reportDate, mezzanotte UTC). */
  dateKey: string;
  bias: Record<ScorecardAsset, string>;
  confidence: Record<ScorecardAsset, number>;
  /** Prezzo di chiusura del giorno del report; null se il payload non lo ha. */
  price: Record<ScorecardAsset, string | null>;
}

/** Una valutazione risolta: un bias × una finestra close-to-close. */
export interface ResolvedSample {
  asset: ScorecardAsset;
  type: ScorecardReportType;
  reportId: string;
  fromDate: string;
  toDate: string;
  bias: MacroBias;
  confidence: number;
  fromPrice: string;
  toPrice: string;
  /** Variazione come FRAZIONE con segno, 6 decimali ("0.004500"). */
  changePct: string;
  outcome: ScorecardOutcome;
  /** Regola ufficiale (NON coincide con la diagonale della matrice). */
  hit: boolean;
  /** Bias del report precedente della stessa catena (per la persistenza). */
  prevBias: MacroBias | null;
}

export interface HitCount {
  hits: number;
  total: number;
}

export interface BenchmarkSet {
  /** Predice sempre RIALZISTA. */
  alwaysBull: HitCount;
  /** Predice sempre NEUTRALE. */
  alwaysNeutral: HitCount;
  /** Predice il bias del report precedente (primo report escluso). */
  persistence: HitCount;
}

export interface ConfidenceBucket {
  /** Etichetta visibile ("≤50", "51-64", "≥65"). */
  label: string;
  min: number;
  max: number;
  hit: HitCount;
}

export interface TimelineBand {
  fromDate: string;
  toDate: string;
  bias: MacroBias;
}

export interface AssetTimeline {
  /** Punti prezzo della catena DAILY (solo report con prezzo). */
  points: { date: string; price: string }[];
  /** Bande [from,to) colorate col bias del report di partenza. */
  bands: TimelineBand[];
}

export interface ScorecardResult {
  samples: ResolvedSample[];
  overall: HitCount;
  byAsset: Record<ScorecardAsset, HitCount>;
  benchmarks: BenchmarkSet;
  benchmarksByAsset: Record<ScorecardAsset, BenchmarkSet>;
  matrix: Record<
    ScorecardAsset,
    Record<MacroBias, Record<ScorecardOutcome, number>>
  >;
  confidenceBuckets: ConfidenceBucket[];
  /** null sotto BRIER_MIN_SAMPLES valutazioni: mai un numero rumoroso. */
  brier: string | null;
  timeline: Record<ScorecardAsset, AssetTimeline>;
}

/* ── helper puri ─────────────────────────────────────────────────────── */

function isMacroBias(value: string): value is MacroBias {
  return (MACRO_BIASES as readonly string[]).includes(value);
}

/** Prezzo valido = stringa decimale parsabile e > 0; tutto il resto è assente. */
function parsePrice(value: string | null): Decimal | null {
  if (value === null) return null;
  try {
    const dec = new Decimal(value);
    return dec.isFinite() && dec.gt(0) ? dec : null;
  } catch {
    return null;
  }
}

/** Regola ufficiale di correttezza (vedi header: non modificarla). */
export function evaluateBias(
  bias: MacroBias,
  changePct: Decimal,
  threshold: Decimal,
): boolean {
  if (bias === "RIALZISTA") return changePct.gt(0);
  if (bias === "RIBASSISTA") return changePct.lt(0);
  return changePct.abs().lte(threshold);
}

/** Partizione a 3 vie dell'esito per la matrice (soglia inclusa nel PIATTO). */
export function classifyOutcome(
  changePct: Decimal,
  threshold: Decimal,
): ScorecardOutcome {
  if (changePct.abs().lte(threshold)) return "PIATTO";
  return changePct.gt(0) ? "RIALZO" : "RIBASSO";
}

function emptyHitCount(): HitCount {
  return { hits: 0, total: 0 };
}

function emptyBenchmarks(): BenchmarkSet {
  return {
    alwaysBull: emptyHitCount(),
    alwaysNeutral: emptyHitCount(),
    persistence: emptyHitCount(),
  };
}

function emptyMatrix(): Record<MacroBias, Record<ScorecardOutcome, number>> {
  const matrix = {} as Record<MacroBias, Record<ScorecardOutcome, number>>;
  for (const bias of MACRO_BIASES) {
    matrix[bias] = { RIALZO: 0, RIBASSO: 0, PIATTO: 0 };
  }
  return matrix;
}

function tally(count: HitCount, hit: boolean): void {
  count.total += 1;
  if (hit) count.hits += 1;
}

export const CONFIDENCE_BUCKETS: { label: string; min: number; max: number }[] =
  [
    { label: "≤50", min: 0, max: 50 },
    { label: "51-64", min: 51, max: 64 },
    { label: "≥65", min: 65, max: 100 },
  ];

/** Percentuale intera di un conteggio ("67"); null senza campione. */
export function hitPct(count: HitCount): string | null {
  if (count.total === 0) return null;
  return new Decimal(count.hits)
    .div(count.total)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toString();
}

/* ── risoluzione ─────────────────────────────────────────────────────── */

/**
 * Risolve tutte le valutazioni possibili dalle righe dei report.
 * `rows` in qualunque ordine: il modulo ordina per data (le catene DAILY e
 * WEEKLY sono indipendenti). Duplicati (type,dateKey) impossibili a DB.
 */
export function resolveScorecard(rows: ScorecardReportRow[]): ScorecardResult {
  const samples: ResolvedSample[] = [];
  const timeline = {} as Record<ScorecardAsset, AssetTimeline>;
  for (const asset of SCORECARD_ASSETS) {
    timeline[asset] = { points: [], bands: [] };
  }

  // Aggregati riempiti nello stesso passaggio di risoluzione, sempre sulla
  // variazione GREZZA (il changePct del campione è arrotondato per display).
  const overall = emptyHitCount();
  const byAsset = {} as Record<ScorecardAsset, HitCount>;
  const benchmarks = emptyBenchmarks();
  const benchmarksByAsset = {} as Record<ScorecardAsset, BenchmarkSet>;
  const matrix = {} as ScorecardResult["matrix"];
  for (const asset of SCORECARD_ASSETS) {
    byAsset[asset] = emptyHitCount();
    benchmarksByAsset[asset] = emptyBenchmarks();
    matrix[asset] = emptyMatrix();
  }
  const confidenceBuckets: ConfidenceBucket[] = CONFIDENCE_BUCKETS.map(
    (bucket) => ({ ...bucket, hit: emptyHitCount() }),
  );
  let brierSum = new Decimal(0);

  for (const type of ["DAILY", "WEEKLY"] as const) {
    const chain = rows
      .filter((r) => r.type === type)
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

    for (const asset of SCORECARD_ASSETS) {
      const threshold = new Decimal(ASSET_THRESHOLDS[asset]);
      // Catena dei soli report con prezzo valido per QUESTO asset: le coppie
      // si formano tra elementi consecutivi di questa lista (i report senza
      // prezzo non interrompono la catena, semplicemente non ne fanno parte).
      const priced = chain.filter((r) => parsePrice(r.price[asset]) !== null);

      if (type === "DAILY") {
        timeline[asset].points = priced.map((r) => ({
          date: r.dateKey,
          price: new Decimal(r.price[asset]!).toString(),
        }));
      }

      for (let i = 0; i < priced.length - 1; i += 1) {
        const from = priced[i];
        const to = priced[i + 1];
        const biasValue = from.bias[asset];
        if (!isMacroBias(biasValue)) continue; // difensivo: mai a DB oggi

        const fromPrice = parsePrice(from.price[asset])!;
        const toPrice = parsePrice(to.price[asset])!;
        const changePct = toPrice.minus(fromPrice).div(fromPrice);

        // Persistenza: bias del report precedente della catena COMPLETA
        // (il precedente non ha bisogno di un prezzo per aver emesso un bias).
        const chainIndex = chain.indexOf(from);
        const prevRaw = chainIndex > 0 ? chain[chainIndex - 1].bias[asset] : null;
        const prevBias = prevRaw !== null && isMacroBias(prevRaw) ? prevRaw : null;

        if (type === "DAILY") {
          timeline[asset].bands.push({
            fromDate: from.dateKey,
            toDate: to.dateKey,
            bias: biasValue,
          });
        }

        const outcome = classifyOutcome(changePct, threshold);
        const hit = evaluateBias(biasValue, changePct, threshold);
        const confidenceValue = from.confidence[asset];

        samples.push({
          asset,
          type,
          reportId: from.id,
          fromDate: from.dateKey,
          toDate: to.dateKey,
          bias: biasValue,
          confidence: confidenceValue,
          fromPrice: fromPrice.toString(),
          toPrice: toPrice.toString(),
          changePct: changePct.toFixed(6),
          outcome,
          hit,
          prevBias,
        });

        tally(overall, hit);
        tally(byAsset[asset], hit);
        matrix[asset][biasValue][outcome] += 1;

        for (const set of [benchmarks, benchmarksByAsset[asset]]) {
          tally(set.alwaysBull, evaluateBias("RIALZISTA", changePct, threshold));
          tally(
            set.alwaysNeutral,
            evaluateBias("NEUTRALE", changePct, threshold),
          );
          if (prevBias !== null) {
            tally(set.persistence, evaluateBias(prevBias, changePct, threshold));
          }
        }

        const bucket = confidenceBuckets.find(
          (b) => confidenceValue >= b.min && confidenceValue <= b.max,
        );
        if (bucket) tally(bucket.hit, hit);

        // Brier: p = confidenza dichiarata del bias, o = esito 0/1.
        const p = new Decimal(confidenceValue).div(100);
        brierSum = brierSum.plus(p.minus(hit ? 1 : 0).pow(2));
      }
    }
  }

  const brier =
    overall.total >= BRIER_MIN_SAMPLES
      ? brierSum.div(overall.total).toFixed(3)
      : null;

  return {
    samples,
    overall,
    byAsset,
    benchmarks,
    benchmarksByAsset,
    matrix,
    confidenceBuckets,
    brier,
    timeline,
  };
}
