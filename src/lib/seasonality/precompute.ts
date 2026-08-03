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
  weeklyLogReturns,
  weeklyMeanLevels,
  type DailyBar,
  type MonthlyObservation,
  type WeeklyObservation,
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
  /** Campione nell'UNITÀ del bucket: mesi per il mese, settimane per la
   * settimana, giorni per il giorno della settimana, sessioni (giorni) per
   * la sessione, ore per l'ora. Informazione aggiuntiva accanto a `n`, mai
   * il denominatore della statistica. */
  rawCount: number;
  mean: number;
  median: number;
  stdev: number | null;
  positiveShare: number;
  p25: number;
  p75: number;
  /** Quota di osservazioni davvero dentro [media−σ, media+σ]; null se σ non
   * è definita. La UI mostra QUESTA, mai il 68% teorico. */
  withinSigma: number | null;
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

/**
 * Osservazione singola di una casella di heatmap: (granularità, anno, bucket).
 * `year` è l'anno civile per MONTH e WEEKDAY, l'anno ISO per WEEK.
 */
export interface YearBucketObsRow {
  instrument: SeasonalityInstrument;
  granularity: SeasonalityGranularity;
  /** Rilevante solo per HOUR; ROME per tutte le altre granularità. */
  clock: SeasonalityClock;
  year: number;
  bucket: number;
  value: number;
  days: number;
}

export interface PrecomputeResult {
  stats: StatRow[];
  paths: PathRow[];
  observations: YearBucketObsRow[];
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

/**
 * Data convenzionale di un'osservazione settimanale: il lunedì di quella
 * settimana ISO. Serve solo a `firstDate`/`lastDate` delle statistiche, cioè
 * a dichiarare l'intervallo che ha prodotto il numero.
 */
function weekKeyDate(isoYear: number, week: number): string {
  // Il 4 gennaio sta per definizione nella settimana 1: da lì si conta.
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Weekday = isoWeekday(isoYear, 1, 4);
  const monday = new Date(
    jan4 - (jan4Weekday - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000,
  );
  return monday.toISOString().slice(0, 10);
}

/** Tutte le settimane ISO possibili: la 53 non esiste ogni anno, e il bucket
 * semplicemente avrà `n` più basso — come il 29 febbraio. */
const WEEK_BUCKETS = Array.from({ length: 53 }, (_, i) => i + 1);
const MONTH_BUCKETS = Array.from({ length: 12 }, (_, i) => i + 1);

interface Observation {
  value: number;
  date: string;
  year: number;
  month: number;
  /** Solo per le osservazioni giornaliere. */
  weekday?: number;
  /**
   * Peso dell'osservazione nel «campione» dichiarato in tabella, nell'UNITÀ
   * del bucket: un mese conta UNO (un gennaio è un'occorrenza, non i suoi 21
   * giorni di quotazione), una settimana conta uno, un giorno conta uno.
   * Omesso = 1. Resta separato da `n`, che conta le unità statistiche.
   */
  days?: number;
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
  /**
   * Aggrega le osservazioni per (anno, bucket) PRIMA di calcolare, così che
   * l'unità statistica sia la casella della griglia e non il dato grezzo.
   * Serve al giorno della settimana, dove esistono ~52 lunedì l'anno ma la
   * griglia sopra la tabella mostra una riga per anno: senza, `n` sarebbe
   * 1044 e la StDev misurerebbe la dispersione fra singoli lunedì invece
   * che fra anni. Mese e settimana non ne hanno bisogno — hanno già una
   * osservazione per anno.
   */
  aggregateByYear?: boolean;
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

  /* Le UNITÀ statistiche: o le osservazioni così come sono, o la loro media
     per (anno, bucket). `raw` porta avanti il conteggio dei dati grezzi, che
     l'aggregazione non deve perdere — è il numero che la tabella mostra come
     «campione». Il detrend è già stato applicato ai valori: sottrarre una
     costante e poi mediare dà lo stesso risultato che mediare e poi
     sottrarla, quindi l'ordine non cambia niente. */
  interface Unit {
    value: number;
    date: string;
    bucket: number;
    raw: number;
  }
  let units: Unit[];
  if (opts.aggregateByYear) {
    const acc = new Map<
      string,
      { sum: number; count: number; bucket: number; dates: string[] }
    >();
    observations.forEach((o, i) => {
      const bucket = opts.bucketOf(o);
      if (!opts.buckets.includes(bucket)) return;
      const key = `${o.year}-${bucket}`;
      const cur = acc.get(key);
      if (cur) {
        cur.sum += values[i];
        cur.count += o.days ?? 1;
        cur.dates.push(o.date);
      } else {
        acc.set(key, {
          sum: values[i],
          count: o.days ?? 1,
          bucket,
          dates: [o.date],
        });
      }
    });
    units = [...acc.values()].map((a) => ({
      // La media è pesata sul numero di osservazioni, non sul loro `days`:
      // ogni giorno di quotazione conta uno.
      value: a.sum / a.dates.length,
      date: a.dates.sort()[0],
      bucket: a.bucket,
      raw: a.count,
    }));
  } else {
    units = observations.map((o, i) => ({
      value: values[i],
      date: o.date,
      bucket: opts.bucketOf(o),
      raw: o.days ?? 1,
    }));
  }

  // Soglia per la quota "sopra la mediana" dei livelli, calcolata una volta
  // sull'intera finestra (non per bucket: serve un riferimento comune) e
  // sulle stesse unità che poi si confrontano con lei.
  const sortedAll = units.map((u) => u.value).sort((a, b) => a - b);
  const windowMedian = quantileSorted(sortedAll, 0.5);
  const isPositive =
    kind === "LEVEL"
      ? (v: number) => v > windowMedian
      : (v: number) => v > 0;

  const grouped = new Map<
    number,
    { values: number[]; dates: string[]; raw: number }
  >();
  for (const u of units) {
    if (!opts.buckets.includes(u.bucket)) continue;
    const entry = grouped.get(u.bucket);
    if (entry) {
      entry.values.push(u.value);
      entry.dates.push(u.date);
      entry.raw += u.raw;
    } else {
      grouped.set(u.bucket, {
        values: [u.value],
        dates: [u.date],
        raw: u.raw,
      });
    }
  }

  const rows: StatRow[] = [];
  for (const bucket of opts.buckets) {
    const entry = grouped.get(bucket);
    if (!entry) continue; // bucket senza osservazioni: nessuna riga finta a zero
    const described = describeSample(entry.values, isPositive);
    if (!described) continue;
    const withinSigma =
      described.stdev === null
        ? null
        : entry.values.filter(
            (v) =>
              v >= described.mean - described.stdev! &&
              v <= described.mean + described.stdev!,
          ).length / described.n;
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
      rawCount: entry.raw,
      mean: described.mean,
      median: described.median,
      stdev: described.stdev,
      positiveShare: described.positiveShare,
      p25: described.p25,
      p75: described.p75,
      withinSigma,
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

/**
 * Media dei valori giornalieri per (anno, bucket). Serve alla heatmap del
 * giorno della settimana: la casella «lunedì 2024» non è un'osservazione
 * singola ma il riassunto dei ~52 lunedì di quell'anno, e `days` dichiara su
 * quanti si regge.
 */
function aggregateByYearBucket(
  observations: Observation[],
  bucketOf: (o: Observation) => number,
): { year: number; bucket: number; value: number; days: number }[] {
  const acc = new Map<
    string,
    { year: number; bucket: number; sum: number; days: number }
  >();
  for (const o of observations) {
    const bucket = bucketOf(o);
    if (!WEEKDAY_BUCKETS.includes(bucket as 1 | 2 | 3 | 4 | 5)) continue;
    const key = `${o.year}-${bucket}`;
    const cur = acc.get(key);
    if (cur) {
      cur.sum += o.value;
      cur.days += 1;
    } else {
      acc.set(key, { year: o.year, bucket, sum: o.value, days: 1 });
    }
  }
  return [...acc.values()]
    .map((a) => ({
      year: a.year,
      bucket: a.bucket,
      value: a.sum / a.days,
      days: a.days,
    }))
    .sort((a, b) => a.year - b.year || a.bucket - b.bucket);
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
      observations: [],
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

  // ── Osservazioni SETTIMANALI ISO (heatmap e bucket WEEK) ────────────────
  const weeklyObs: WeeklyObservation[] = isReturn
    ? weeklyLogReturns(bars)
    : weeklyMeanLevels(bars);

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

  /* Niente `days`: il campione di un bucket mensile si conta in MESI —
     «Gennaio, 20 anni» sono venti gennai, non i loro ~420 giorni. */
  const monthObsAsObservation: Observation[] = monthlyObs.map((m) => ({
    value: m.value,
    date: monthKeyDate(m.year, m.month),
    year: m.year,
    month: m.month,
  }));

  /* Le settimane usano l'ANNO ISO come `year`: la settimana a cavallo di
     capodanno appartiene per intero a uno dei due anni, e spezzarla darebbe
     due mezze settimane invece di una. */
  const weekObsAsObservation: Observation[] = weeklyObs.map((w) => ({
    value: w.value,
    date: weekKeyDate(w.isoYear, w.week),
    year: w.isoYear,
    month: w.week, // qui `month` porta il bucket della granularità
  }));

  // ── Osservazioni per le HEATMAP (una casella = una osservazione) ─────────
  const observations: YearBucketObsRow[] = [
    ...monthlyObs.map((m) => ({
      instrument,
      granularity: "MONTH" as const,
      clock: "ROME" as const,
      year: m.year,
      bucket: m.month,
      value: m.value,
      days: m.days,
    })),
    ...weeklyObs.map((w) => ({
      instrument,
      granularity: "WEEK" as const,
      clock: "ROME" as const,
      year: w.isoYear,
      bucket: w.week,
      value: w.value,
      days: w.days,
    })),
    /* Per il giorno della settimana la casella (anno, giorno) è la MEDIA dei
       valori di quel giorno in quell'anno: non esiste un'osservazione
       "il lunedì del 2024", ne esistono cinquantadue. La media è l'unico
       riassunto onesto, e `days` dice su quanti giorni è costruita. */
    ...aggregateByYearBucket(dailyObs, (o) => o.weekday ?? 0).map((a) => ({
      instrument,
      granularity: "WEEKDAY" as const,
      clock: "ROME" as const,
      year: a.year,
      bucket: a.bucket,
      value: a.value,
      days: a.days,
    })),
  ];

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
    const weekWindow = weekObsAsObservation.filter(
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
          buckets: MONTH_BUCKETS,
          bucketOf: (o) => o.month,
        }),
      );

      // WEEK — 53 bucket ISO. La 53 non esiste in tutti gli anni: quel
      // bucket avrà `n` più basso, ed è corretto che sia così.
      stats.push(
        ...statsForBuckets({
          instrument,
          kind,
          granularity: "WEEK",
          scope: SCOPE_ALL,
          lookbackYears: lookback,
          detrended,
          observations: weekWindow,
          buckets: WEEK_BUCKETS,
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
          aggregateByYear: true,
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
            aggregateByYear: true,
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

  /* ── Percorso dell'ANNO IN CORSO (lookbackYears = 0) ────────────────────
     Serve al toggle di sovrapposizione sul grafico: il percorso parziale di
     quest'anno sopra la media stagionale. n = 1 per costruzione, e le
     colonne di dispersione ripetono il valore: un solo anno non ha banda.
     Solo vista grezza — nella vista detrendizzata il confronto con un anno
     non detrendizzabile (è incompleto) non avrebbe significato. */
  const annoCorrente = now.getUTCFullYear();
  const pathCorrente = rawPaths.get(annoCorrente);
  if (pathCorrente) {
    const oggiDoy = dayOfYear(
      annoCorrente,
      now.getUTCMonth() + 1,
      now.getUTCDate(),
    );
    for (let doy = 1; doy <= Math.min(oggiDoy, 366); doy += 1) {
      const v = pathCorrente[doy];
      if (!Number.isFinite(v)) continue;
      paths.push({
        instrument,
        lookbackYears: 0,
        detrended: false,
        dayOfYear: doy,
        meanCum: v,
        medianCum: v,
        p25Cum: v,
        p75Cum: v,
        positiveShare: v > 0 ? 1 : 0,
        n: 1,
      });
    }
  }

  return {
    stats,
    paths,
    observations,
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
