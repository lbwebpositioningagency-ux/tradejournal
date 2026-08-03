/**
 * Precalcolo delle statistiche stagionali — modulo PURO: prende barre
 * giornaliere e restituisce le righe da salvare. Nessuna rete, nessun
 * database, tutto testabile senza infrastruttura.
 *
 * ── DECISIONE CENTRALE: le finestre sono ANNI SOLARI COMPLETI ──────────────
 *
 * «20 anni» significa gli ultimi 20 anni solari CHIUSI, non gli ultimi 7305
 * giorni. L'anno in corso è escluso da tutte le statistiche.
 *
 * Le ragioni, in ordine di importanza:
 * 1. Rende `n` prevedibile e confrontabile. Con una finestra mobile, il
 *    bucket di gennaio potrebbe avere 21 osservazioni e quello di dicembre 20
 *    a seconda del giorno in cui gira il job — due mesi della stessa tabella
 *    con basi diverse.
 * 2. Toglie di mezzo la domanda «il settembre in corso, mezzo finito, è nella
 *    media di settembre?». Con gli anni chiusi la risposta è no, sempre, e
 *    non dipende dalla data di oggi.
 * 3. Rende la tabella STABILE: i numeri cambiano una volta l'anno, non ogni
 *    notte. Una statistica stagionale che si muove tutti i giorni invita a
 *    leggere rumore.
 *
 * L'anno in corso non sparisce: compare nella heatmap come riga parziale,
 * marcata come tale. Semplicemente non entra nelle medie.
 *
 * ── L'unità di osservazione segue il bucket ────────────────────────────────
 * MONTH   → un'osservazione per (anno, mese): il rendimento del mese, o il
 *           livello medio del mese.
 * WEEKDAY → un'osservazione per giorno: il rendimento del giorno, o il
 *           livello del giorno. Non esiste un'unità più piccola di un giorno.
 */

import type {
  SeasonalityClock,
  SeasonalityGranularity,
  SeasonalityInstrument,
  SeasonalityKind,
} from "@/generated/prisma/client";
import { describeSample, quantileSorted } from "@/lib/seasonality/stats";
import {
  SCOPE_ALL,
  WEEKDAY_BUCKETS,
  dayOfYear,
  isoWeekday,
  monthScope,
} from "@/lib/seasonality/buckets";
import {
  cumulativePathsByYear,
  dailyLogReturns,
  detrend,
  levelPathsByYear,
  monthlyLogReturns,
  monthlyMeanLevels,
  type DailyBar,
  type MonthlyObservation,
} from "@/lib/seasonality/series";
import { LOOKBACK_YEARS } from "@/lib/seasonality/instruments";

export interface StatRow {
  instrument: SeasonalityInstrument;
  kind: SeasonalityKind;
  granularity: SeasonalityGranularity;
  clock: SeasonalityClock;
  scope: string;
  lookbackYears: number;
  detrended: boolean;
  bucket: number;
  n: number;
  mean: number;
  median: number;
  stdev: number | null;
  positiveShare: number;
  p25: number;
  p75: number;
  /** "YYYY-MM-DD" */
  firstDate: string;
  lastDate: string;
}

export interface PathRow {
  instrument: SeasonalityInstrument;
  lookbackYears: number;
  detrended: boolean;
  dayOfYear: number;
  meanCum: number;
  medianCum: number;
  p25Cum: number;
  p75Cum: number;
  positiveShare: number;
  n: number;
}

export interface MonthlyObsRow {
  instrument: SeasonalityInstrument;
  year: number;
  month: number;
  value: number;
  days: number;
}

export interface PrecomputeResult {
  stats: StatRow[];
  paths: PathRow[];
  monthly: MonthlyObsRow[];
  /** Estremi effettivi della serie: dichiarati in pagina. */
  firstDate: string | null;
  lastDate: string | null;
  /** Ultimo anno solare COMPLETO usato dalle statistiche. */
  lastCompleteYear: number;
}

/** Intervallo di anni solari completi coperto da una finestra di lookback. */
export function windowYears(
  lookback: number,
  lastCompleteYear: number,
): { from: number; to: number } {
  return { from: lastCompleteYear - lookback + 1, to: lastCompleteYear };
}

/** Data convenzionale di un'osservazione mensile: il primo del mese. */
function monthKeyDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

interface Observation {
  value: number;
  date: string;
  year: number;
  month: number;
  /** Solo per le osservazioni giornaliere. */
  weekday?: number;
}

/**
 * Costruisce le righe di statistica per un insieme di osservazioni già
 * filtrate sulla finestra, raggruppandole con `bucketOf`.
 *
 * `detrended` non cambia il raggruppamento ma le osservazioni: la media
 * generale viene sottratta PRIMA di raggruppare, e su TUTTA la finestra —
 * non per bucket, che azzererebbe ogni bucket, e non per scope, perché il
 * drift è una proprietà della serie e non della fetta che stiamo guardando.
 *
 * Per gli indici di volatilità `positiveShare` cambia significato: non un hit
 * rate (che su un livello non vorrebbe dire niente) ma la quota di
 * osservazioni SOPRA LA MEDIANA di tutta la finestra — cioè la risposta alla
 * domanda giusta: «in questo mese l'indice sta storicamente in alto o in
 * basso?».
 */
function statsForBuckets(opts: {
  instrument: SeasonalityInstrument;
  kind: SeasonalityKind;
  granularity: SeasonalityGranularity;
  scope: string;
  lookbackYears: number;
  detrended: boolean;
  observations: Observation[];
  /**
   * Media da sottrarre quando `detrended`. Va passata quando le osservazioni
   * sono una FETTA della finestra (il drill dentro un mese): il drift è una
   * proprietà della serie intera, e usare la media della fetta toglierebbe
   * anche l'effetto che stiamo misurando. Omessa = media delle osservazioni.
   */
  detrendMean?: number;
  buckets: number[];
  bucketOf: (o: Observation) => number;
}): StatRow[] {
  const { observations, kind, detrended } = opts;
  if (observations.length === 0) return [];

  let values = observations.map((o) => o.value);
  if (detrended) {
    values =
      opts.detrendMean === undefined
        ? detrend(values)
        : values.map((v) => v - opts.detrendMean!);
  }

  // Soglia per la quota "sopra la mediana" dei livelli, calcolata una volta
  // sull'intera finestra (non per bucket: serve un riferimento comune).
  const sortedAll = [...values].sort((a, b) => a - b);
  const windowMedian = quantileSorted(sortedAll, 0.5);
  const isPositive =
    kind === "LEVEL"
      ? (v: number) => v > windowMedian
      : (v: number) => v > 0;

  const grouped = new Map<number, { values: number[]; dates: string[] }>();
  observations.forEach((o, i) => {
    const bucket = opts.bucketOf(o);
    if (!opts.buckets.includes(bucket)) return;
    const entry = grouped.get(bucket);
    if (entry) {
      entry.values.push(values[i]);
      entry.dates.push(o.date);
    } else {
      grouped.set(bucket, { values: [values[i]], dates: [o.date] });
    }
  });

  const rows: StatRow[] = [];
  for (const bucket of opts.buckets) {
    const entry = grouped.get(bucket);
    if (!entry) continue; // bucket senza osservazioni: nessuna riga finta a zero
    const described = describeSample(entry.values, isPositive);
    if (!described) continue;
    const dates = [...entry.dates].sort();
    rows.push({
      instrument: opts.instrument,
      kind,
      granularity: opts.granularity,
      // Le granularità basate sulla data non hanno fuso: riga unica, ROME.
      clock: "ROME",
      scope: opts.scope,
      lookbackYears: opts.lookbackYears,
      detrended,
      bucket,
      n: described.n,
      mean: described.mean,
      median: described.median,
      stdev: described.stdev,
      positiveShare: described.positiveShare,
      p25: described.p25,
      p75: described.p75,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
    });
  }
  return rows;
}

/**
 * Punti del percorso stagionale con bande di dispersione.
 *
 * Per i PREZZI: rendimento log cumulato dal 1° gennaio, un percorso per anno,
 * poi media/mediana/p25/p75 fra gli anni a parità di giorno.
 * Per la VOLATILITÀ: livello (non cumulato — un livello non compone), stessa
 * aggregazione fra anni.
 *
 * Le bande non sono un ornamento: se p25 e p75 stanno a ±8% attorno a una
 * media di +2%, la forma media esiste ma il singolo anno può fare tutt'altro,
 * e il grafico lo deve dire a colpo d'occhio invece di mostrare una linea
 * sola che sembra una previsione.
 */
function pathRows(opts: {
  instrument: SeasonalityInstrument;
  kind: SeasonalityKind;
  lookbackYears: number;
  detrended: boolean;
  pathsByYear: Map<number, number[]>;
  years: number[];
}): PathRow[] {
  const rows: PathRow[] = [];
  const paths = opts.years
    .map((y) => opts.pathsByYear.get(y))
    .filter((p): p is number[] => Array.isArray(p));
  if (paths.length === 0) return rows;

  /* `positiveShare` sul percorso: per i rendimenti è la quota di anni sopra
     lo zero a quel punto dell'anno. Per i LIVELLI lo zero non significa
     niente — un VIX è sempre positivo — quindi il riferimento è la mediana
     di tutti i livelli della finestra: «quanti anni, a questo punto, stavano
     sopra il livello tipico». */
  const reference =
    opts.kind === "LEVEL"
      ? quantileSorted(
          paths
            .flat()
            .filter((v) => Number.isFinite(v))
            .sort((a, b) => a - b),
          0.5,
        )
      : 0;
  const isPositive = (v: number) => v > reference;

  for (let doy = 1; doy <= 366; doy += 1) {
    const values: number[] = [];
    for (const p of paths) {
      const v = p[doy];
      if (Number.isFinite(v)) values.push(v);
    }
    const described = describeSample(values, isPositive);
    if (!described) continue;
    rows.push({
      instrument: opts.instrument,
      lookbackYears: opts.lookbackYears,
      detrended: opts.detrended,
      dayOfYear: doy,
      meanCum: described.mean,
      medianCum: described.median,
      p25Cum: described.p25,
      p75Cum: described.p75,
      positiveShare: described.positiveShare,
      n: described.n,
    });
  }
  return rows;
}

/**
 * Detrend applicato al PERCORSO: si toglie il drift medio giornaliero
 * moltiplicato per i giorni trascorsi, cioè si raddrizza la retta di
 * tendenza lasciando la forma. Sottrarre la media dei cumulati sarebbe
 * sbagliato — abbasserebbe tutta la curva di una costante senza togliere la
 * pendenza, che è esattamente ciò che il detrend deve rimuovere.
 */
function detrendPaths(
  pathsByYear: Map<number, number[]>,
  years: number[],
): Map<number, number[]> {
  let totalDrift = 0;
  let counted = 0;
  for (const y of years) {
    const p = pathsByYear.get(y);
    if (!p || !Number.isFinite(p[365])) continue;
    totalDrift += p[365];
    counted += 1;
  }
  if (counted === 0) return pathsByYear;
  const driftPerDay = totalDrift / counted / 365;

  const out = new Map<number, number[]>();
  for (const [year, p] of pathsByYear) {
    out.set(
      year,
      p.map((v, doy) => (Number.isFinite(v) ? v - driftPerDay * doy : v)),
    );
  }
  return out;
}

export function precomputeDaily(opts: {
  instrument: SeasonalityInstrument;
  kind: SeasonalityKind;
  bars: DailyBar[];
  /** Data di riferimento: da qui si ricava l'ultimo anno solare completo. */
  now?: Date;
}): PrecomputeResult {
  const { instrument, kind, bars } = opts;
  const now = opts.now ?? new Date();
  const lastCompleteYear = now.getUTCFullYear() - 1;

  if (bars.length === 0) {
    return {
      stats: [],
      paths: [],
      monthly: [],
      firstDate: null,
      lastDate: null,
      lastCompleteYear,
    };
  }

  const isReturn = kind === "RETURN";

  // ── Osservazioni mensili (alimentano heatmap e bucket MONTH) ─────────────
  const monthlyObs: MonthlyObservation[] = isReturn
    ? monthlyLogReturns(bars)
    : monthlyMeanLevels(bars);

  const monthly: MonthlyObsRow[] = monthlyObs.map((m) => ({
    instrument,
    year: m.year,
    month: m.month,
    value: m.value,
    days: m.days,
  }));

  // ── Osservazioni giornaliere (bucket WEEKDAY) ────────────────────────────
  const dailyObs: Observation[] = isReturn
    ? dailyLogReturns(bars).map((d) => ({
        value: d.r,
        date: d.date,
        year: Number(d.date.slice(0, 4)),
        month: Number(d.date.slice(5, 7)),
        weekday: isoWeekday(
          Number(d.date.slice(0, 4)),
          Number(d.date.slice(5, 7)),
          Number(d.date.slice(8, 10)),
        ),
      }))
    : bars.map((b) => ({
        value: b.close,
        date: b.date,
        year: Number(b.date.slice(0, 4)),
        month: Number(b.date.slice(5, 7)),
        weekday: isoWeekday(
          Number(b.date.slice(0, 4)),
          Number(b.date.slice(5, 7)),
          Number(b.date.slice(8, 10)),
        ),
      }));

  const monthObsAsObservation: Observation[] = monthlyObs.map((m) => ({
    value: m.value,
    date: monthKeyDate(m.year, m.month),
    year: m.year,
    month: m.month,
  }));

  // ── Percorsi annuali ────────────────────────────────────────────────────
  const rawPaths = isReturn
    ? cumulativePathsByYear(
        dailyObs.map((o) => ({ date: o.date, r: o.value })),
      )
    : levelPathsByYear(bars);

  const stats: StatRow[] = [];
  const paths: PathRow[] = [];
  // I prezzi hanno anche la vista detrendizzata; i livelli no — non c'è un
  // drift da togliere a un indice che oscilla attorno alla sua media.
  const detrendVariants = isReturn ? [false, true] : [false];

  for (const lookback of LOOKBACK_YEARS) {
    const { from, to } = windowYears(lookback, lastCompleteYear);
    const years: number[] = [];
    for (let y = from; y <= to; y += 1) years.push(y);

    const monthWindow = monthObsAsObservation.filter(
      (o) => o.year >= from && o.year <= to,
    );
    const dayWindow = dailyObs.filter((o) => o.year >= from && o.year <= to);

    /* Media del drift sulla finestra intera, per granularità: è il
       riferimento del detrend anche per le fette del drill. */
    const dayWindowMean =
      dayWindow.length > 0
        ? dayWindow.reduce((a, o) => a + o.value, 0) / dayWindow.length
        : 0;

    for (const detrended of detrendVariants) {
      // MONTH — 12 bucket, sempre su tutto l'anno.
      stats.push(
        ...statsForBuckets({
          instrument,
          kind,
          granularity: "MONTH",
          scope: SCOPE_ALL,
          lookbackYears: lookback,
          detrended,
          observations: monthWindow,
          buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          bucketOf: (o) => o.month,
        }),
      );

      // WEEKDAY — lunedì-venerdì, su tutto l'anno e dentro ogni mese
      // (è il drill: «quali giorni hanno funzionato A SETTEMBRE»).
      stats.push(
        ...statsForBuckets({
          instrument,
          kind,
          granularity: "WEEKDAY",
          scope: SCOPE_ALL,
          lookbackYears: lookback,
          detrended,
          observations: dayWindow,
          buckets: [...WEEKDAY_BUCKETS],
          bucketOf: (o) => o.weekday ?? 0,
        }),
      );
      for (let m = 1; m <= 12; m += 1) {
        stats.push(
          ...statsForBuckets({
            instrument,
            kind,
            granularity: "WEEKDAY",
            scope: monthScope(m),
            lookbackYears: lookback,
            detrended,
            // Il detrend usa la media dell'INTERA finestra, non quella del
            // mese: questa riga misura il giorno DENTRO il mese, e togliere
            // la media di settembre cancellerebbe proprio l'effetto
            // settembre che stiamo guardando.
            detrendMean: dayWindowMean,
            observations: dayWindow.filter((o) => o.month === m),
            buckets: [...WEEKDAY_BUCKETS],
            bucketOf: (o) => o.weekday ?? 0,
          }),
        );
      }

      const usable = detrended ? detrendPaths(rawPaths, years) : rawPaths;
      paths.push(
        ...pathRows({
          instrument,
          kind,
          lookbackYears: lookback,
          detrended,
          pathsByYear: usable,
          years,
        }),
      );
    }
  }

  return {
    stats,
    paths,
    monthly,
    firstDate: bars[0].date,
    lastDate: bars[bars.length - 1].date,
    lastCompleteYear,
  };
}

/** Giorno dell'anno di oggi, per l'indicatore «siamo qui» sul percorso. */
export function todayDayOfYear(now: Date = new Date()): number {
  return dayOfYear(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}
