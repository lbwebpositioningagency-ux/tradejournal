import type { FredObservation } from "@/lib/fred";
import type { DeltaMode } from "@/lib/macro-trends-series";
import {
  dateKeyToDays,
  nearestObservation,
  type SeriesCadence,
} from "@/lib/macro-trends-transforms";

/**
 * Layer calcolato della pagina Trends (FASE 29): trend, variazioni di
 * periodo, percentile storico e posizione nel ciclo. Modulo PURO: lavora
 * sulla serie GIÀ trasformata e già scaricata (orizzonte Max) — nessuna
 * chiamata FRED, nessuna interpolazione, aritmetica float da display.
 *
 * Onestà statistica:
 * - il percentile è calcolato sulla storia disponibile della serie (che
 *   varia da indicatore a indicatore): la UI dichiara l'anno di partenza;
 * - meno di MIN_HISTORY_SAMPLES osservazioni = metrica assente, mai un
 *   numero su un pugno di punti;
 * - i valori sono gli ultimi RIVISTI pubblicati da FRED (default dell'API,
 *   niente vintage ALFRED).
 */

export type TrendLabel = "rialzista" | "ribassista" | "laterale";
export type CycleLabel =
  | "espansione"
  | "rallentamento"
  | "contrazione"
  | "ripresa";

export interface PeriodChange {
  /** "MoM" · "YoY" · "QoQ" · "1S" · "1M" (dalla cadenza della serie). */
  label: string;
  /** Delta nelle unità della serie (pct=false) o in % (pct=true); null se non calcolabile. */
  value: number | null;
  pct: boolean;
}

export interface SeriesMetrics {
  trend: TrendLabel | null;
  /** Pendenza (ultime 6 oss.) / dev. std. delle variazioni storiche. */
  trendZ: number | null;
  changes: PeriodChange[];
  /** Percentile (0-100) dell'ultimo valore sulla storia intera. */
  percentile: number | null;
  /** Anno della prima osservazione: il "dal ..." dichiarato in UI. */
  historyStartYear: string | null;
  cycle: CycleLabel | null;
  /** Z-score dell'ultimo livello vs storia intera (asse X del ciclo). */
  levelZ: number | null;
}

/** Finestra della regressione del trend (spec: ultime 6 osservazioni). */
export const TREND_WINDOW = 6;
/** |z| sotto la soglia = laterale. */
export const TREND_Z_THRESHOLD = 0.5;
/** Sotto questo numero di campioni le statistiche non si calcolano. */
export const MIN_HISTORY_SAMPLES = 20;

/**
 * Pendenza dei minimi quadrati per passo di osservazione (x = 0,1,2…).
 * null con meno di 2 punti.
 */
export function linearSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const v of values) meanY += v;
  meanY /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Deviazione standard di popolazione; null con meno di 2 valori. */
export function stdDev(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  return Math.sqrt(variance / n);
}

export interface TrendResult {
  label: TrendLabel;
  z: number;
  /** Pendenza grezza: serve al ciclo come direzione anche quando laterale. */
  slope: number;
}

/**
 * TREND: pendenza sulle ultime TREND_WINDOW osservazioni, normalizzata
 * sulla dev. std. STORICA delle variazioni periodo-su-periodo dell'intera
 * serie. Serie senza variazioni (sd=0) = laterale per definizione.
 */
export function trendMetric(
  observations: FredObservation[],
): TrendResult | null {
  if (observations.length < TREND_WINDOW) return null;
  const diffs: number[] = [];
  for (let i = 1; i < observations.length; i += 1) {
    diffs.push(observations[i].value - observations[i - 1].value);
  }
  if (diffs.length < MIN_HISTORY_SAMPLES) return null;
  const sd = stdDev(diffs);
  const slope = linearSlope(
    observations.slice(-TREND_WINDOW).map((o) => o.value),
  );
  if (sd === null || slope === null) return null;
  if (sd === 0) {
    // Variazioni storiche tutte identiche: una pendenza non nulla è un
    // trend "infinitamente" netto (z convenzionale ±99, mai Infinity nel
    // payload RSC); pendenza nulla = serie ferma.
    if (slope === 0) return { label: "laterale", z: 0, slope };
    return slope > 0
      ? { label: "rialzista", z: 99, slope }
      : { label: "ribassista", z: -99, slope };
  }
  const z = slope / sd;
  const label: TrendLabel =
    Math.abs(z) < TREND_Z_THRESHOLD
      ? "laterale"
      : z > 0
        ? "rialzista"
        : "ribassista";
  return { label, z, slope };
}

interface ChangeSpec {
  label: string;
  /** "prev" = osservazione precedente; numero = giorni indietro dal punto più recente. */
  target: "prev" | number;
  toleranceDays: number;
}

/**
 * Variazioni per cadenza (spec FASE 29): mensili MoM+YoY, trimestrali
 * QoQ+YoY, daily/weekly 1 settimana + 1 mese. Aggancio all'osservazione
 * reale più vicina entro tolleranza, mai interpolazioni.
 */
const CHANGE_SPECS: Record<SeriesCadence, ChangeSpec[]> = {
  monthly: [
    { label: "MoM", target: "prev", toleranceDays: 0 },
    { label: "YoY", target: 365, toleranceDays: 47 },
  ],
  quarterly: [
    { label: "QoQ", target: "prev", toleranceDays: 0 },
    { label: "YoY", target: 365, toleranceDays: 95 },
  ],
  daily: [
    { label: "1S", target: 7, toleranceDays: 5 },
    { label: "1M", target: 30, toleranceDays: 10 },
  ],
  weekly: [
    { label: "1S", target: 7, toleranceDays: 4 },
    { label: "1M", target: 30, toleranceDays: 15 },
  ],
};

export function periodChanges(
  observations: FredObservation[],
  cadence: SeriesCadence,
  deltaMode: DeltaMode,
): PeriodChange[] {
  const pct = deltaMode === "pct";
  const specs = CHANGE_SPECS[cadence];
  if (observations.length === 0) {
    return specs.map((s) => ({ label: s.label, value: null, pct }));
  }
  const last = observations[observations.length - 1];
  const lastDays = dateKeyToDays(last.date);

  return specs.map((spec) => {
    let base: FredObservation | null = null;
    if (spec.target === "prev") {
      base =
        observations.length > 1 ? observations[observations.length - 2] : null;
    } else {
      base = nearestObservation(
        observations,
        lastDays - spec.target,
        spec.toleranceDays,
      );
    }
    if (base === null || base.date === last.date) {
      return { label: spec.label, value: null, pct };
    }
    if (pct) {
      if (base.value === 0) return { label: spec.label, value: null, pct };
      return {
        label: spec.label,
        value: ((last.value - base.value) / Math.abs(base.value)) * 100,
        pct,
      };
    }
    return { label: spec.label, value: last.value - base.value, pct };
  });
}

/**
 * PERCENTILE STORICO: quota di osservazioni dell'INTERA storia disponibile
 * ≤ ultimo valore (stessa convenzione del percentileRank a finestra).
 */
export function percentileAllHistory(
  observations: FredObservation[],
): number | null {
  const n = observations.length;
  if (n < MIN_HISTORY_SAMPLES) return null;
  const last = observations[n - 1].value;
  let atOrBelow = 0;
  for (const o of observations) {
    if (o.value <= last) atOrBelow += 1;
  }
  return Math.round((atOrBelow / n) * 100);
}

export interface CycleResult {
  label: CycleLabel;
  levelZ: number;
}

/**
 * POSIZIONE NEL CICLO, a quadranti:
 * asse X = livello vs trend storico (z-score dell'ultimo valore su media e
 * dev. std. dell'intera serie) · asse Y = direzione (segno della pendenza
 * del TREND — anche quando l'etichetta è "laterale" la direzione resta
 * quella della regressione).
 * Sopra + salita = espansione · sopra + discesa = rallentamento ·
 * sotto + discesa = contrazione · sotto + salita = ripresa.
 */
export function cycleMetric(
  observations: FredObservation[],
  slope: number,
): CycleResult | null {
  if (observations.length < MIN_HISTORY_SAMPLES) return null;
  const values = observations.map((o) => o.value);
  const sd = stdDev(values);
  if (sd === null || sd === 0) return null;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  const levelZ = (values[values.length - 1] - mean) / sd;
  const above = levelZ >= 0;
  const up = slope >= 0;
  const label: CycleLabel = above
    ? up
      ? "espansione"
      : "rallentamento"
    : up
      ? "ripresa"
      : "contrazione";
  return { label, levelZ };
}

export interface PrevailingResult<T extends string> {
  /** Etichetta più frequente; null se nessun voto o pareggio. */
  winner: T | null;
  /** true = pareggio tra 2+ etichette in testa (mai scelta arbitraria). */
  tie: boolean;
  /** Voti dell'etichetta (o delle etichette) in testa. */
  count: number;
  /** Voti totali non-null (gli indicatori sotto soglia non votano). */
  total: number;
}

/**
 * Etichetta prevalente per le pillole di sezione (FASE 31): conta le
 * etichette non-null e restituisce la più frequente. Pareggio in testa =
 * winner null con tie=true («Misto» in UI); nessun voto = winner null e
 * total 0 («N/D»). Pura: la UI decide solo colori e testi.
 */
export function prevailingLabel<T extends string>(
  labels: (T | null)[],
): PrevailingResult<T> {
  const counts = new Map<T, number>();
  let total = 0;
  for (const label of labels) {
    if (label === null) continue;
    total += 1;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (total === 0) return { winner: null, tie: false, count: 0, total: 0 };
  let winner: T | null = null;
  let best = 0;
  let tie = false;
  for (const [label, count] of counts) {
    if (count > best) {
      best = count;
      winner = label;
      tie = false;
    } else if (count === best) {
      tie = true;
    }
  }
  return { winner: tie ? null : winner, tie, count: best, total };
}

export interface MetricsOptions {
  cadence: SeriesCadence;
  deltaMode: DeltaMode;
  /** false per la sezione Volatilità: lì il "ciclo" non ha senso. */
  includeCycle: boolean;
}

/** Orchestratore: ogni metrica degrada a null per conto suo, mai un crash. */
export function computeSeriesMetrics(
  observations: FredObservation[],
  options: MetricsOptions,
): SeriesMetrics {
  const trend = trendMetric(observations);
  const cycle =
    options.includeCycle && trend !== null
      ? cycleMetric(observations, trend.slope)
      : null;
  return {
    trend: trend?.label ?? null,
    trendZ: trend?.z ?? null,
    changes: periodChanges(observations, options.cadence, options.deltaMode),
    percentile: percentileAllHistory(observations),
    historyStartYear:
      observations.length > 0 ? observations[0].date.slice(0, 4) : null,
    cycle: cycle?.label ?? null,
    levelZ: cycle?.levelZ ?? null,
  };
}
