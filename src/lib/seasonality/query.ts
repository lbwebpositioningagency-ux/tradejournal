/**
 * Letture della Stagionalità per la UI — SOLO precalcolato.
 *
 * Qui non si calcola niente e non si contatta nessuna fonte: si leggono
 * righe già aggregate dal job notturno. È l'invariante che tiene in piedi la
 * promessa fatta nella spec — nessuna latenza di rete nel rendering, e la
 * stessa pagina ricaricata due volte mostra gli stessi numeri.
 *
 * I `Decimal` vengono convertiti in `number` sul confine: è display, ed è
 * l'unica conversione ammessa dalle regole del progetto.
 */

import { prisma } from "@/lib/db";
import type {
  SeasonalityClock,
  SeasonalityGranularity,
  SeasonalityInstrument,
  SeasonalityKind,
} from "@/generated/prisma/client";
import { SEASONALITY_BY_CODE } from "@/lib/seasonality/instruments";
import { logToPercent } from "@/lib/seasonality/series";
import { sampleQuality, type SampleQuality } from "@/lib/seasonality/stats";
import { windowYears } from "@/lib/seasonality/precompute";

export interface BucketView {
  bucket: number;
  n: number;
  /** RETURN: media dei log-rendimenti. LEVEL: livello medio. */
  mean: number;
  median: number;
  stdev: number | null;
  positiveShare: number;
  p25: number;
  p75: number;
  /** Osservazioni grezze (giorni o ore) dietro le medie annue: informazione
   * aggiuntiva accanto a `n`, che resta il numero di anni. */
  rawCount: number | null;
  /** Copertura empirica della banda media±1σ (null se σ non definita). */
  withinSigma: number | null;
  firstDate: string;
  lastDate: string;
  quality: SampleQuality;
}

export interface CoverageView {
  instrument: SeasonalityInstrument;
  kind: SeasonalityKind;
  source: string | null;
  first: string | null;
  last: string | null;
  rows: number;
  computedAt: Date | null;
  note: string | null;
  /** Copertura dell'archivio ORARIO (mesi assenti), separata da `note`. */
  hourNote: string | null;
  /** Anni solari completi realmente disponibili sul GIORNALIERO. */
  completeYears: number | null;
  /** Sorgente e copertura delle barre ORARIE (null se lo strumento non ne ha). */
  hourSource: string | null;
  hourFirst: string | null;
  hourLast: string | null;
  hourRows: number;
  /** Anni solari completi disponibili sull'INTRADAY: limita le finestre. */
  hourCompleteYears: number | null;
}

export interface WindowCoverage {
  lookbackYears: number;
  /** Anni richiesti dalla finestra. */
  requested: number;
  /** Anni effettivamente coperti dai dati. */
  available: number;
  /** La finestra chiede più storia di quanta ne esista. */
  truncated: boolean;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Ultimo anno solare completo: la base di tutte le finestre. */
export function lastCompleteYear(now: Date = new Date()): number {
  return now.getUTCFullYear() - 1;
}

export async function getCoverage(): Promise<CoverageView[]> {
  const rows = await prisma.seasonalityCoverage.findMany();
  const byCode = new Map(rows.map((r) => [r.instrument, r]));
  const lcy = lastCompleteYear();

  // L'ordine è quello del catalogo, non quello del database: la pagina deve
  // avere sempre la stessa sequenza, anche quando una riga non esiste ancora.
  return [...SEASONALITY_BY_CODE.values()].map((def) => {
    const row = byCode.get(def.code);
    const first = row?.dailyFirst ? iso(row.dailyFirst) : null;
    const hourFirst = row?.hourFirst ? iso(row.hourFirst) : null;
    return {
      instrument: def.code,
      kind: def.kind,
      source: row?.dailySource ?? null,
      first,
      last: row?.dailyLast ? iso(row.dailyLast) : null,
      rows: row?.dailyRows ?? 0,
      computedAt: row?.computedAt ?? null,
      note: row?.note ?? def.unavailable ?? null,
      hourNote: row?.hourNote ?? null,
      completeYears:
        first === null ? null : Math.max(0, lcy - Number(first.slice(0, 4)) + 1),
      hourSource: row?.hourSource ?? null,
      hourFirst,
      hourLast: row?.hourLast ? iso(row.hourLast) : null,
      hourRows: row?.hourRows ?? 0,
      hourCompleteYears:
        hourFirst === null
          ? null
          : Math.max(0, lcy - Number(hourFirst.slice(0, 4)) + 1),
    };
  });
}

/**
 * Quanto della finestra richiesta è davvero coperto. Serve all'avviso
 * «hai chiesto 20 anni, ce ne sono 18»: la spec vieta di fingere vent'anni,
 * e vieta anche di nascondere l'opzione — resta selezionabile, ma dichiarata.
 */
export function windowCoverage(
  lookbacks: readonly number[],
  completeYears: number | null,
): WindowCoverage[] {
  return lookbacks.map((lb) => {
    const available = completeYears === null ? 0 : Math.min(lb, completeYears);
    return {
      lookbackYears: lb,
      requested: lb,
      available,
      truncated: available < lb,
    };
  });
}

function toView(row: {
  bucket: number;
  n: number;
  mean: unknown;
  median: unknown;
  stdev: unknown;
  positiveShare: unknown;
  p25: unknown;
  p75: unknown;
  rawCount?: number | null;
  withinSigma?: unknown;
  firstDate: Date;
  lastDate: Date;
}): BucketView {
  return {
    bucket: row.bucket,
    n: row.n,
    mean: Number(row.mean),
    median: Number(row.median),
    stdev: row.stdev === null ? null : Number(row.stdev),
    positiveShare: Number(row.positiveShare),
    p25: Number(row.p25),
    p75: Number(row.p75),
    rawCount: row.rawCount ?? null,
    withinSigma:
      row.withinSigma === null || row.withinSigma === undefined
        ? null
        : Number(row.withinSigma),
    firstDate: iso(row.firstDate),
    lastDate: iso(row.lastDate),
    quality: sampleQuality(row.n),
  };
}

export async function getBucketStats(opts: {
  instrument: SeasonalityInstrument;
  granularity: SeasonalityGranularity;
  scope?: string;
  lookbackYears: number;
  detrended: boolean;
  clock?: SeasonalityClock;
}): Promise<BucketView[]> {
  const rows = await prisma.seasonalityStat.findMany({
    where: {
      instrument: opts.instrument,
      granularity: opts.granularity,
      scope: opts.scope ?? "ALL",
      lookbackYears: opts.lookbackYears,
      detrended: opts.detrended,
      clock: opts.clock ?? "ROME",
    },
    orderBy: { bucket: "asc" },
  });
  return rows.map(toView);
}

/**
 * Statistiche di una granularità per PIÙ finestre in una sola query: è la
 * tabella «per bucket, su tutte le finestre» (mese, settimana o giorno).
 */
export async function getStatsByWindow(opts: {
  instrument: SeasonalityInstrument;
  granularity: SeasonalityGranularity;
  scope?: string;
  lookbacks: readonly number[];
  detrended: boolean;
  clock?: SeasonalityClock;
}): Promise<Map<number, BucketView[]>> {
  const rows = await prisma.seasonalityStat.findMany({
    where: {
      instrument: opts.instrument,
      granularity: opts.granularity,
      scope: opts.scope ?? "ALL",
      lookbackYears: { in: [...opts.lookbacks] },
      detrended: opts.detrended,
      clock: opts.clock ?? "ROME",
    },
    orderBy: [{ lookbackYears: "desc" }, { bucket: "asc" }],
  });
  const out = new Map<number, BucketView[]>();
  for (const row of rows) {
    const list = out.get(row.lookbackYears);
    if (list) list.push(toView(row));
    else out.set(row.lookbackYears, [toView(row)]);
  }
  return out;
}

export interface HeatmapCell {
  year: number;
  bucket: number;
  value: number;
  days: number;
  /** Periodo con pochi giorni di quotazione: colorarlo come gli altri mentirebbe. */
  partial: boolean;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  years: number[];
  /** Anno in corso: presente nella griglia, ESCLUSO da tutte le medie. */
  currentYear: number;
}

/**
 * Griglia anni × bucket (mesi, settimane ISO o giorni della settimana). Gli
 * anni mostrati sono quelli della finestra selezionata, più l'anno in corso —
 * che compare marcato come parziale perché è utile vederlo, non perché conti
 * nelle statistiche.
 */
export async function getHeatmap(opts: {
  instrument: SeasonalityInstrument;
  granularity: SeasonalityGranularity;
  lookbackYears: number;
  clock?: SeasonalityClock;
  now?: Date;
}): Promise<HeatmapData> {
  const now = opts.now ?? new Date();
  const lcy = lastCompleteYear(now);
  const { from } = windowYears(opts.lookbackYears, lcy);
  const currentYear = now.getUTCFullYear();

  const rows = await prisma.seasonalityYearBucketObs.findMany({
    where: {
      instrument: opts.instrument,
      granularity: opts.granularity,
      clock: opts.clock ?? "ROME",
      year: { gte: from, lte: currentYear },
    },
    orderBy: [{ year: "desc" }, { bucket: "asc" }],
  });

  const years: number[] = [];
  for (let y = currentYear; y >= from; y -= 1) years.push(y);

  /* Soglia di "periodo incompleto" proporzionata alla granularità: 5 giorni
     su un mese sono pochi, su una settimana sono la settimana intera. */
  const minDays =
    opts.granularity === "MONTH"
      ? 5
      : opts.granularity === "WEEK"
        ? 2
        : opts.granularity === "WEEKDAY"
          ? 10
          : // SESSION e HOUR contano ORE, non giorni: una casella con meno di
            // cento ore in un anno non è un anno di dati.
            100;

  return {
    cells: rows.map((r) => ({
      year: r.year,
      bucket: r.bucket,
      value: Number(r.value),
      days: r.days,
      partial: r.days < minDays,
    })),
    years,
    currentYear,
  };
}

export interface PathPointView {
  dayOfYear: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  positiveShare: number;
  n: number;
}

export async function getPaths(opts: {
  instrument: SeasonalityInstrument;
  lookbacks: readonly number[];
  detrended: boolean;
}): Promise<Map<number, PathPointView[]>> {
  const rows = await prisma.seasonalityPathPoint.findMany({
    where: {
      instrument: opts.instrument,
      lookbackYears: { in: [...opts.lookbacks] },
      detrended: opts.detrended,
    },
    orderBy: [{ lookbackYears: "desc" }, { dayOfYear: "asc" }],
  });
  const out = new Map<number, PathPointView[]>();
  for (const row of rows) {
    const point: PathPointView = {
      dayOfYear: row.dayOfYear,
      mean: Number(row.meanCum),
      median: Number(row.medianCum),
      p25: Number(row.p25Cum),
      p75: Number(row.p75Cum),
      positiveShare: Number(row.positiveShare),
      n: row.n,
    };
    const list = out.get(row.lookbackYears);
    if (list) list.push(point);
    else out.set(row.lookbackYears, [point]);
  }
  return out;
}

/** Ultima esecuzione del job: la pagina dichiara quanto è fresco il dato. */
export async function getLastRun(): Promise<{
  finishedAt: Date | null;
  ok: boolean;
} | null> {
  const run = await prisma.seasonalityRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { finishedAt: true, ok: true },
  });
  return run ?? null;
}

/**
 * Finestre di lookback effettivamente sensate per una granularità.
 *
 * Sull'INTRADAY la storia è molto più corta che sul giornaliero — il CFD del
 * DAX parte dal 2013 — e una finestra da 20 anni non esiste proprio. La spec
 * vieta di fingere dati: le finestre oltre lo storico disponibile vengono
 * **nascoste**, non mostrate vuote. Sul giornaliero restano invece tutte
 * selezionabili e marcate, perché lì la storia c'è quasi sempre e il campione
 * ridotto è un'informazione, non un'assenza.
 */
export function intradayLookbacks(
  lookbacks: readonly number[],
  hourCompleteYears: number | null,
): number[] {
  if (hourCompleteYears === null || hourCompleteYears <= 0) return [];
  const usable = lookbacks.filter((lb) => lb <= hourCompleteYears);
  // Se nemmeno la finestra più corta ci sta, si tiene comunque quella: meglio
  // una riga con `n` basso e dichiarato che una pagina vuota senza spiegazione.
  return usable.length > 0 ? usable : [Math.min(...lookbacks)];
}

/**
 * Percorso intraday a 96 punti (quarti d'ora) per finestra di lookback.
 *
 * Alimenta SOLO il grafico del ritorno intraday. Le tabelle e la heatmap
 * della vista Ora restano sulle barre H1 con le loro statistiche complete:
 * qui non c'è StDev né Pos%, c'è una media, perché è l'unica cosa che il
 * grafico disegna.
 *
 * L'aggregazione è la stessa di sempre — livello ANNO: si legge la media
 * annua di ogni quarto d'ora e si fa la media fra gli anni della finestra.
 * Una finestra da 10 anni con solo 6 anni in archivio produce 6 anni, non un
 * errore: `years` lo dichiara e la pagina lo mostra.
 */
export async function getQuarterPaths(opts: {
  instrument: SeasonalityInstrument;
  clock: SeasonalityClock;
  lookbacks: number[];
  detrended: boolean;
  now?: Date;
}): Promise<
  Map<number, { values: number[]; years: number; emptyBuckets: number }>
> {
  const out = new Map<
    number,
    { values: number[]; years: number; emptyBuckets: number }
  >();
  if (opts.lookbacks.length === 0) return out;

  const lcy = lastCompleteYear(opts.now ?? new Date());
  const maxLookback = Math.max(...opts.lookbacks);
  const rows = await prisma.seasonalityQuarterYear.findMany({
    where: {
      instrument: opts.instrument,
      clock: opts.clock,
      year: { gte: lcy - maxLookback + 1, lte: lcy },
    },
    select: { year: true, bucket: true, mean: true },
  });
  if (rows.length === 0) return out;

  for (const lookback of opts.lookbacks) {
    const from = lcy - lookback + 1;
    const perBucket = new Map<number, { sum: number; n: number }>();
    const anni = new Set<number>();
    for (const r of rows) {
      if (r.year < from) continue;
      anni.add(r.year);
      const cur = perBucket.get(r.bucket);
      const v = Number(r.mean);
      if (cur) {
        cur.sum += v;
        cur.n += 1;
      } else {
        perBucket.set(r.bucket, { sum: v, n: 1 });
      }
    }
    if (anni.size === 0) continue;

    /* Un quarto d'ora senza NESSUNA quotazione in tutta la finestra non è un
       buco d'archivio ma un mercato chiuso: la pausa di manutenzione serale
       di CME ed Eurex, che sul DAX e sull'S&P vale otto e quattro quarti
       d'ora. Il cumulato ci passa sopra piatto — che è quanto è successo:
       niente. Non è un valore stimato, e la pagina lo dichiara invece di
       lasciarlo interpretare a chi guarda. */
    let emptyBuckets = 0;
    const medie: number[] = [];
    for (let b = 0; b < 96; b += 1) {
      const e = perBucket.get(b);
      if (!e) emptyBuckets += 1;
      medie.push(e ? e.sum / e.n : 0);
    }

    /* Detrend: si toglie il drift MEDIO del quarto d'ora, cioè la media dei
       96 bucket. Sul cumulato significa che la giornata parte e finisce a
       zero, e resta solo la FORMA — quali momenti spingono rispetto alla
       media della giornata, che è la domanda della vista «solo stagionalità». */
    const drift = opts.detrended
      ? medie.reduce((a, v) => a + v, 0) / medie.length
      : 0;

    /* Cumulato in log (additivo), convertito in punti base solo alla fine:
       la conversione a metà strada romperebbe l'additività. */
    const values: number[] = [];
    let cum = 0;
    for (const m of medie) {
      cum += m - drift;
      values.push(Number((logToPercent(cum) * 100).toFixed(3)));
    }
    out.set(lookback, { values, years: anni.size, emptyBuckets });
  }
  return out;
}
