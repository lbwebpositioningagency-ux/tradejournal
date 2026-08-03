/**
 * Precalcolo INTRADAY (sessione e ora) — modulo PURO: prende barre orarie e
 * restituisce le righe da salvare.
 *
 * ── La regola che protegge dai buchi ──────────────────────────────────────
 *
 * Un rendimento orario esiste SOLO se la barra precedente è esattamente
 * un'ora prima. Non è una precauzione teorica:
 *
 * - ogni fine settimana c'è un buco di ~48 ore. Senza la regola, il salto fra
 *   la chiusura del venerdì e la riapertura della domenica sera finirebbe
 *   tutto dentro il bucket della domenica sera — che risulterebbe l'ora più
 *   volatile della settimana per puro artefatto;
 * - l'archivio Dukascopy del WTI (`lightcmdusd`) non ha **marzo 2024**:
 *   verificato, con gennaio, febbraio e aprile pieni. Senza la regola, il
 *   movimento di un mese intero verrebbe attribuito alla prima ora di aprile;
 * - le festività producono buchi di uno o più giorni su tutti gli strumenti.
 *
 * Con la regola, la prima barra dopo un buco semplicemente non produce
 * rendimento: il buco si traduce in un campione più piccolo — dichiarato da
 * `n`, che è sempre in tabella — e mai in un numero sbagliato.
 */

import type {
  SeasonalityClock,
  SeasonalityInstrument,
  SeasonalityKind,
} from "@/generated/prisma/client";
import { describeSample } from "@/lib/seasonality/stats";
import { CLOCKS, CLOCK_TIMEZONE, SCOPE_ALL, zonedParts } from "@/lib/seasonality/buckets";
import { marketSessionBucket } from "@/lib/seasonality/market-sessions";
import { detrend } from "@/lib/seasonality/series";
import { LOOKBACK_YEARS } from "@/lib/seasonality/instruments";
import type { StatRow, YearBucketObsRow } from "@/lib/seasonality/precompute";
import { windowYears } from "@/lib/seasonality/precompute";

export interface HourBar {
  /** Inizio dell'ora, UTC. */
  ts: Date;
  close: number;
}

export interface HourReturn {
  ts: Date;
  /** ln(P_t / P_{t-1}), con t-1 esattamente un'ora prima. */
  r: number;
}

const ONE_HOUR_MS = 3_600_000;

/**
 * Rendimenti orari, con la regola di adiacenza. Le barre DEVONO essere
 * ordinate: il chiamante le legge già ordinate dal database.
 */
export function hourlyLogReturns(bars: HourBar[]): HourReturn[] {
  const out: HourReturn[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1];
    const cur = bars[i];
    if (cur.ts.getTime() - prev.ts.getTime() !== ONE_HOUR_MS) continue;
    if (prev.close <= 0 || cur.close <= 0) continue;
    out.push({ ts: cur.ts, r: Math.log(cur.close / prev.close) });
  }
  return out;
}

/**
 * Mesi INTERAMENTE assenti fra la prima e l'ultima barra.
 *
 * Non è la stessa cosa dei blocchi vuoti visti in fase di scarico: quelli
 * dipendono da come si è chiesto il dato, questi da cosa c'è davvero in
 * tabella. È la misura onesta della copertura, e va detta in pagina — un
 * archivio con dieci mesi mancanti su quindici anni resta utilizzabile, ma
 * chi legge deve saperlo invece di scoprirlo da un `n` più basso del previsto.
 */
export function missingMonths(bars: HourBar[]): string[] {
  if (bars.length === 0) return [];
  const present = new Set<string>();
  for (const b of bars) {
    present.add(
      `${b.ts.getUTCFullYear()}-${String(b.ts.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  const out: string[] = [];
  const first = bars[0].ts;
  const last = bars[bars.length - 1].ts;
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth() + 1;
  const endY = last.getUTCFullYear();
  const endM = last.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!present.has(key)) out.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Quante ore mancano rispetto a una copertura continua: misura del buco. */
export function coverageGaps(bars: HourBar[]): {
  expected: number;
  present: number;
  skipped: number;
} {
  if (bars.length < 2) return { expected: 0, present: bars.length, skipped: 0 };
  const span =
    (bars[bars.length - 1].ts.getTime() - bars[0].ts.getTime()) / ONE_HOUR_MS +
    1;
  let adjacent = 0;
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i].ts.getTime() - bars[i - 1].ts.getTime() === ONE_HOUR_MS) {
      adjacent += 1;
    }
  }
  return {
    expected: Math.round(span),
    present: bars.length,
    skipped: bars.length - 1 - adjacent,
  };
}

interface IntradayObservation {
  value: number;
  ts: Date;
  /** Anno civile UTC: la finestra di lookback si valuta lì. */
  year: number;
  /** Bucket orario nei due orologi. */
  hour: Record<SeasonalityClock, number>;
  session: number;
}

function toObservations(returns: HourReturn[]): IntradayObservation[] {
  return returns.map((r) => {
    const hour = {} as Record<SeasonalityClock, number>;
    for (const clock of CLOCKS) {
      hour[clock] = zonedParts(r.ts, CLOCK_TIMEZONE[clock]).hour;
    }
    return {
      value: r.r,
      ts: r.ts,
      year: r.ts.getUTCFullYear(),
      hour,
      session: marketSessionBucket(r.ts),
    };
  });
}

function isoDate(ts: Date): string {
  return ts.toISOString().slice(0, 10);
}

function buildStats(opts: {
  instrument: SeasonalityInstrument;
  kind: SeasonalityKind;
  granularity: "SESSION" | "HOUR";
  clock: SeasonalityClock;
  lookbackYears: number;
  detrended: boolean;
  observations: IntradayObservation[];
  buckets: number[];
  bucketOf: (o: IntradayObservation) => number;
}): StatRow[] {
  const { observations, detrended } = opts;
  if (observations.length === 0) return [];

  let values = observations.map((o) => o.value);
  if (detrended) values = detrend(values);

  const grouped = new Map<number, { values: number[]; ts: number[] }>();
  observations.forEach((o, i) => {
    const bucket = opts.bucketOf(o);
    const entry = grouped.get(bucket);
    if (entry) {
      entry.values.push(values[i]);
      entry.ts.push(o.ts.getTime());
    } else {
      grouped.set(bucket, { values: [values[i]], ts: [o.ts.getTime()] });
    }
  });

  const rows: StatRow[] = [];
  for (const bucket of opts.buckets) {
    const entry = grouped.get(bucket);
    if (!entry) continue; // nessuna riga finta a zero
    const described = describeSample(entry.values);
    if (!described) continue;
    rows.push({
      instrument: opts.instrument,
      kind: opts.kind,
      granularity: opts.granularity,
      clock: opts.clock,
      scope: SCOPE_ALL,
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
      firstDate: isoDate(new Date(Math.min(...entry.ts))),
      lastDate: isoDate(new Date(Math.max(...entry.ts))),
    });
  }
  return rows;
}

/** Media dei rendimenti orari per (anno, bucket): una casella di heatmap. */
function aggregateByYear(
  observations: IntradayObservation[],
  bucketOf: (o: IntradayObservation) => number,
): { year: number; bucket: number; value: number; days: number }[] {
  const acc = new Map<
    string,
    { year: number; bucket: number; sum: number; days: number }
  >();
  for (const o of observations) {
    const bucket = bucketOf(o);
    const key = `${o.year}-${bucket}`;
    const cur = acc.get(key);
    if (cur) {
      cur.sum += o.value;
      cur.days += 1;
    } else {
      acc.set(key, { year: o.year, bucket, sum: o.value, days: 1 });
    }
  }
  return [...acc.values()].map((a) => ({
    year: a.year,
    bucket: a.bucket,
    value: a.sum / a.days,
    days: a.days,
  }));
}

export interface IntradayResult {
  stats: StatRow[];
  observations: YearBucketObsRow[];
  /** Anni solari completi coperti dall'intraday: limita le finestre in UI. */
  completeYears: number;
  firstTs: Date | null;
  lastTs: Date | null;
  gaps: { expected: number; present: number; skipped: number };
  /** Mesi interamente assenti dall'archivio, in ordine. */
  missingMonths: string[];
}

const HOUR_BUCKETS = Array.from({ length: 24 }, (_, i) => i);
const SESSION_BUCKETS = [0, 1, 2, 3];

/**
 * Precalcolo di SESSION e HOUR.
 *
 * HOUR viene calcolata DUE VOLTE, una per orologio: il toggle in pagina
 * cambia riga, non rietichetta. Rietichettare sarebbe sbagliato perché fra
 * CET e CEST lo scarto Roma↔UTC cambia dentro l'anno.
 *
 * SESSION esiste in una sola versione: i suoi confini sono ancorati agli
 * orari dei centri finanziari (vedi `market-sessions.ts`), quindi non
 * dipendono dall'orologio di visualizzazione — cambia solo come li si scrive
 * in legenda.
 */
export function precomputeIntraday(opts: {
  instrument: SeasonalityInstrument;
  bars: HourBar[];
  now?: Date;
}): IntradayResult {
  const { instrument, bars } = opts;
  const now = opts.now ?? new Date();
  const lastCompleteYear = now.getUTCFullYear() - 1;

  if (bars.length === 0) {
    return {
      stats: [],
      observations: [],
      completeYears: 0,
      firstTs: null,
      lastTs: null,
      gaps: { expected: 0, present: 0, skipped: 0 },
      missingMonths: [],
    };
  }

  const returns = hourlyLogReturns(bars);
  const observations = toObservations(returns);
  const firstYear = bars[0].ts.getUTCFullYear();

  const stats: StatRow[] = [];
  const obsRows: YearBucketObsRow[] = [];

  // Le sessioni non hanno variante per orologio: una riga sola.
  for (const a of aggregateByYear(observations, (o) => o.session)) {
    obsRows.push({
      instrument,
      granularity: "SESSION",
      clock: "ROME",
      year: a.year,
      bucket: a.bucket,
      value: a.value,
      days: a.days,
    });
  }
  for (const clock of CLOCKS) {
    for (const a of aggregateByYear(observations, (o) => o.hour[clock])) {
      obsRows.push({
        instrument,
        granularity: "HOUR",
        clock,
        year: a.year,
        bucket: a.bucket,
        value: a.value,
        days: a.days,
      });
    }
  }

  for (const lookback of LOOKBACK_YEARS) {
    const { from, to } = windowYears(lookback, lastCompleteYear);
    const window = observations.filter((o) => o.year >= from && o.year <= to);
    if (window.length === 0) continue;

    for (const detrended of [false, true]) {
      stats.push(
        ...buildStats({
          instrument,
          kind: "RETURN",
          granularity: "SESSION",
          clock: "ROME",
          lookbackYears: lookback,
          detrended,
          observations: window,
          buckets: SESSION_BUCKETS,
          bucketOf: (o) => o.session,
        }),
      );
      for (const clock of CLOCKS) {
        stats.push(
          ...buildStats({
            instrument,
            kind: "RETURN",
            granularity: "HOUR",
            clock,
            lookbackYears: lookback,
            detrended,
            observations: window,
            buckets: HOUR_BUCKETS,
            bucketOf: (o) => o.hour[clock],
          }),
        );
      }
    }
  }

  return {
    stats,
    observations: obsRows,
    completeYears: Math.max(0, lastCompleteYear - firstYear + 1),
    firstTs: bars[0].ts,
    lastTs: bars[bars.length - 1].ts,
    gaps: coverageGaps(bars),
    missingMonths: missingMonths(bars),
  };
}
