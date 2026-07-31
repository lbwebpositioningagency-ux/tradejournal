import { fetchFredSeries } from "@/lib/fred";
import {
  RECESSION_SERIES_ID,
  type TrendsSeriesDef,
} from "@/lib/macro-trends-series";
import {
  applyTransform,
  comparisonRow,
  dateKeyToDays,
  isStale,
  percentileRank,
  thinObservations,
  type ComparisonRow,
} from "@/lib/macro-trends-transforms";
import {
  computeSeriesMetrics,
  type SeriesMetrics,
} from "@/lib/macro-trends-metrics";

/**
 * Orchestratore server della pagina Trends: scarica le serie in parallelo
 * PER SEZIONE (P-05 — l'unità di streaming: Promise.allSettled, una serie
 * che fallisce non fa cadere la sezione), applica i transform puri e
 * riduce il payload per il client (osservazioni sfoltite, valori
 * arrotondati a 4 decimali).
 *
 * SOLO server-side: il client riceve dati già pronti, mai chiavi o fetch.
 */

/** [data, valore] — compatto per il payload RSC. */
export type TrendsPoint = [string, number];

export interface RecessionBand {
  from: string;
  to: string;
}

export interface SeriesPercentiles {
  y1: number | null;
  y3: number | null;
  y5: number | null;
}

export interface TrendsSeriesView {
  def: TrendsSeriesDef;
  status: "ok" | "error";
  /** Breve, per la card in stato errore. */
  error?: string;
  /** Serie trasformata e sfoltita (finestra Max), ordinata per data. */
  points: TrendsPoint[];
  latestDate?: string;
  latestValue?: number;
  /** Variazione vs osservazione precedente (unità del transform). */
  delta?: number | null;
  stale?: boolean;
  comparison?: ComparisonRow;
  percentiles?: SeriesPercentiles;
  /** Layer calcolato FASE 29 (trend, variazioni, percentile, ciclo). */
  metrics?: SeriesMetrics;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** USREC (0/1 mensile NBER) → intervalli [from, to] delle recessioni. */
export function recessionBands(
  observations: { date: string; value: number }[],
): RecessionBand[] {
  const bands: RecessionBand[] = [];
  let start: string | null = null;
  let last: string | null = null;
  for (const obs of observations) {
    if (obs.value === 1) {
      if (start === null) start = obs.date;
      last = obs.date;
    } else if (start !== null) {
      bands.push({ from: start, to: obs.date });
      start = null;
    }
  }
  if (start !== null && last !== null) bands.push({ from: start, to: last });
  return bands;
}

async function buildSeriesView(def: TrendsSeriesDef): Promise<TrendsSeriesView> {
  const { observations } = await fetchFredSeries(def.fredIds);
  const transformed = applyTransform(observations, def.transform);
  if (transformed.length === 0) {
    return {
      def,
      status: "error",
      error: "serie troppo corta per la trasformazione richiesta",
      points: [],
    };
  }
  const latest = transformed[transformed.length - 1];
  const prev =
    transformed.length > 1 ? transformed[transformed.length - 2] : null;
  const nowDays = dateKeyToDays(new Date().toISOString().slice(0, 10));

  // Layer calcolato sulla serie trasformata COMPLETA (orizzonte Max, già
  // scaricata): niente ciclo per la Volatilità, dove l'etichetta non ha senso.
  const rawMetrics = computeSeriesMetrics(transformed, {
    cadence: def.cadence,
    deltaMode: def.deltaMode,
    includeCycle: def.section !== "volatilita",
    goodDirection: def.goodDirection,
  });
  const metrics: SeriesMetrics = {
    ...rawMetrics,
    trendZ: rawMetrics.trendZ === null ? null : round4(rawMetrics.trendZ),
    levelZ: rawMetrics.levelZ === null ? null : round4(rawMetrics.levelZ),
    changes: rawMetrics.changes.map((c) => ({
      ...c,
      value: c.value === null ? null : round4(c.value),
    })),
  };

  return {
    def,
    status: "ok",
    points: thinObservations(transformed, def.cadence).map((o) => [
      o.date,
      round4(o.value),
    ]),
    latestDate: latest.date,
    latestValue: round4(latest.value),
    delta: prev === null ? null : round4(latest.value - prev.value),
    stale: isStale(latest.date, def.cadence, nowDays),
    comparison: comparisonRow(transformed, def.cadence),
    percentiles: def.percentiles
      ? {
          y1: percentileRank(transformed, 1),
          y3: percentileRank(transformed, 3),
          y5: percentileRank(transformed, 5),
        }
      : undefined,
    metrics,
  };
}

/**
 * P-05 — costruzione PER-SEZIONE, l'unità di streaming della pagina: la
 * sezione pronta compare senza aspettare la più lenta delle ~50 serie.
 * Ogni serie che fallisce diventa la sua card in errore (mai un reject:
 * queste promise alimentano `use()` nel client, un reject bucherebbe la
 * pagina intera). L'ordine del registry è preservato.
 */
export async function getTrendsSection(
  defs: TrendsSeriesDef[],
): Promise<TrendsSeriesView[]> {
  const results = await Promise.allSettled(
    defs.map((def) => buildSeriesView(def)),
  );
  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return {
      def: defs[i],
      status: "error" as const,
      error: String(result.reason).slice(0, 200),
      points: [],
    };
  });
}

/** USREC per le bande grigie: in errore, nessuna banda (mai un reject). */
export async function getTrendsRecessions(): Promise<RecessionBand[]> {
  try {
    const { observations } = await fetchFredSeries([RECESSION_SERIES_ID]);
    return recessionBands(observations);
  } catch {
    return [];
  }
}
