import { fetchFredSeries, hasFredApiKey } from "@/lib/fred";
import {
  RECESSION_SERIES_ID,
  TRENDS_SERIES,
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

/**
 * Orchestratore server della pagina Trends: scarica TUTTE le serie in
 * parallelo (Promise.allSettled: una serie che fallisce non fa cadere la
 * pagina), applica i transform puri e riduce il payload per il client
 * (osservazioni sfoltite, valori arrotondati a 4 decimali).
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
}

export interface TrendsData {
  /** ISO dell'assemblaggio (= "ultimo tentativo" per le card in errore). */
  generatedAt: string;
  /** true se si sta lavorando col solo CSV keyless (chiave non configurata). */
  keyless: boolean;
  recessions: RecessionBand[];
  series: TrendsSeriesView[];
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
  };
}

export async function getMacroTrendsData(): Promise<TrendsData> {
  const [seriesResults, recessionResult] = await Promise.all([
    Promise.allSettled(TRENDS_SERIES.map((def) => buildSeriesView(def))),
    Promise.allSettled([fetchFredSeries([RECESSION_SERIES_ID])]).then(
      (r) => r[0],
    ),
  ]);

  const series: TrendsSeriesView[] = seriesResults.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return {
      def: TRENDS_SERIES[i],
      status: "error",
      error: String(result.reason).slice(0, 200),
      points: [],
    };
  });

  const recessions =
    recessionResult.status === "fulfilled"
      ? recessionBands(recessionResult.value.observations)
      : [];

  return {
    generatedAt: new Date().toISOString(),
    keyless: !hasFredApiKey(),
    recessions,
    series,
  };
}
