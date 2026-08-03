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
  SeasonalityGranularity,
  SeasonalityInstrument,
  SeasonalityKind,
} from "@/generated/prisma/client";
import { SEASONALITY_BY_CODE } from "@/lib/seasonality/instruments";
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
  /** Anni solari completi realmente disponibili. */
  completeYears: number | null;
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
    return {
      instrument: def.code,
      kind: def.kind,
      source: row?.dailySource ?? null,
      first,
      last: row?.dailyLast ? iso(row.dailyLast) : null,
      rows: row?.dailyRows ?? 0,
      computedAt: row?.computedAt ?? null,
      note: row?.note ?? def.unavailable ?? null,
      completeYears:
        first === null ? null : Math.max(0, lcy - Number(first.slice(0, 4)) + 1),
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
}): Promise<BucketView[]> {
  const rows = await prisma.seasonalityStat.findMany({
    where: {
      instrument: opts.instrument,
      granularity: opts.granularity,
      scope: opts.scope ?? "ALL",
      lookbackYears: opts.lookbackYears,
      detrended: opts.detrended,
      clock: "ROME",
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
}): Promise<Map<number, BucketView[]>> {
  const rows = await prisma.seasonalityStat.findMany({
    where: {
      instrument: opts.instrument,
      granularity: opts.granularity,
      scope: opts.scope ?? "ALL",
      lookbackYears: { in: [...opts.lookbacks] },
      detrended: opts.detrended,
      clock: "ROME",
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
      year: { gte: from, lte: currentYear },
    },
    orderBy: [{ year: "desc" }, { bucket: "asc" }],
  });

  const years: number[] = [];
  for (let y = currentYear; y >= from; y -= 1) years.push(y);

  /* Soglia di "periodo incompleto" proporzionata alla granularità: 5 giorni
     su un mese sono pochi, su una settimana sono la settimana intera. */
  const minDays =
    opts.granularity === "MONTH" ? 5 : opts.granularity === "WEEK" ? 2 : 10;

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
