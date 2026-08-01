import Decimal from "decimal.js";
import { avgR, avgWinLossR } from "./averages";
import { expectancy } from "./expectancy";
import { profitFactor } from "./profit-factor";
import { winRate } from "./win-rate";
import type { MetricInfoData, RSplitAggregates } from "./types";

/**
 * §2/§3 — performance per SEGMENTO (fascia oraria, durata del trade).
 *
 * Modulo puro: riceve gli aggregati già calcolati in SQL e ne deriva le
 * metriche di lettura riusando le formule esistenti (`winRate`,
 * `expectancy`, `profitFactor`) — nessuna aritmetica duplicata, nessun
 * ricalcolo di R o P&L: l'R medio esce da `rSum / rCount`, dove `rSum` è la
 * somma dei `Trade.rMultiple` denormalizzati dalla pipeline.
 *
 * Convenzioni del progetto: tassi come frazioni 0-1 a 4 decimali (il ×100
 * sta in UI), "nessun dato" → null, mai uno 0 che sembra un risultato.
 */

export interface SegmentAggregates extends Partial<RSplitAggregates> {
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPnl: string;
  winSum: string;
  lossSum: string;
  rSum: string;
  rCount: number;
}

/**
 * Sotto questa soglia il segmento è statisticamente muto: si mostra, ma
 * marcato. Una fascia con 3 trade non può avere la stessa credibilità
 * visiva di una con 40 — è il modo più facile per leggere rumore come
 * segnale e cambiare il proprio trading per niente.
 */
export const SMALL_SAMPLE_THRESHOLD = 5;

export interface SegmentMetrics {
  total: number;
  wins: number;
  losses: number;
  /** Frazione 0-1; null senza trade. */
  winRate: string | null;
  /**
   * Expectancy in R (l'ex "R medio"): media dell'R realizzato su tutti i
   * trade con rischio definito; null senza. Il nome del campo resta `avgR`
   * per non toccare i grafici che ci si appoggiano — è cambiata l'etichetta.
   */
  avgR: string | null;
  /**
   * Avg Win/Loss in R; null se manca del tutto un lato (o se lo split R non
   * arriva dalla query, come per le finestre rolling).
   */
  avgWinLoss: string | null;
  /** Attesa per trade in VALUTA; null senza trade. */
  expectancy: string | null;
  profitFactor: string | null;
  netPnl: string;
  /** Trade con rischio definito: denominatore onesto dell'R medio. */
  rCount: number;
  /** True se il campione è troppo piccolo per fidarsi del dato. */
  smallSample: boolean;
  /** True se il segmento non ha alcun trade. */
  empty: boolean;
}

export function segmentMetrics(row: SegmentAggregates): SegmentMetrics {
  const empty = row.total === 0;
  return {
    total: row.total,
    wins: row.wins,
    losses: row.losses,
    winRate: empty ? null : winRate(row.wins, row.total),
    avgR: avgR(row.rSum, row.rCount),
    avgWinLoss:
      row.rWinSum !== undefined &&
      row.rWinCount !== undefined &&
      row.rLossSum !== undefined &&
      row.rLossCount !== undefined
        ? avgWinLossR({
            rWinSum: row.rWinSum,
            rWinCount: row.rWinCount,
            rLossSum: row.rLossSum,
            rLossCount: row.rLossCount,
          })
        : null,
    expectancy: empty ? null : expectancy(row),
    profitFactor: profitFactor(row.winSum, row.lossSum),
    netPnl: row.netPnl,
    rCount: row.rCount,
    // Un segmento vuoto non è "campione ridotto": è assenza di dati.
    smallSample: !empty && row.total < SMALL_SAMPLE_THRESHOLD,
    empty,
  };
}

// ── §2 — fasce orarie ───────────────────────────────────────────────────

export interface HourSegment extends SegmentMetrics {
  hour: number;
  /** "09-10" */
  label: string;
}

/** Etichetta della fascia: 9 → "09-10", 23 → "23-24". */
export function hourLabel(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}-${pad(hour + 1 === 24 ? 24 : hour + 1)}`;
}

/**
 * Riempie TUTTE le 24 fasce, anche quelle senza trade: un buco nel grafico
 * è un'informazione ("a quell'ora non opero"), una fascia mancante è un
 * grafico che mente sulla forma della giornata.
 */
export function fillHourSegments(
  rows: (SegmentAggregates & { hour: number })[],
): HourSegment[] {
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, hour) => {
    const row = byHour.get(hour) ?? emptyAggregates();
    return { hour, label: hourLabel(hour), ...segmentMetrics(row) };
  });
}

function emptyAggregates(): SegmentAggregates {
  return {
    total: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    netPnl: "0",
    winSum: "0",
    lossSum: "0",
    rSum: "0",
    rCount: 0,
    rWinSum: "0",
    rWinCount: 0,
    rLossSum: "0",
    rLossCount: 0,
  };
}

// ── §3 — bucket di durata ───────────────────────────────────────────────

/**
 * Confini RICALIBRATI sulla distribuzione reale dei dati.
 *
 * I confini di partenza proposti (<5m · 5-15m · 15-30m · 30-60m · 1-4h ·
 * >4h) sono stati verificati sui due dataset disponibili e scartati:
 * - `<5 min` risultava **vuoto in entrambi** (0 trade su 411): una fascia
 *   che non esiste occupa spazio e non dice nulla;
 * - `1-4h` raccoglieva il **67,8%** dei trade dell'utente demo e il 32% di
 *   SIM1: dentro quel blocco unico spariva ogni differenza;
 * - `>4h` era il 31,5% di SIM1 ma **0%** dell'altro dataset, e ci finivano
 *   insieme trade da cinque ore e trade da tre giorni.
 *
 * La mediana è ~94 minuti in entrambi i dataset, il p75 sta a 282 minuti
 * (SIM1) e 135 (demo). Da qui i confini attuali: la prima fascia parte da
 * zero senza sprecare un bucket, la zona 1-4h viene spezzata in due dove
 * cade la mediana, e gli overnight/multi-day hanno una fascia propria
 * (SIM1 arriva a 69 ore).
 */
export const DURATION_BUCKETS = [
  { key: "lt15m", label: "< 15 min", maxSeconds: 900 },
  { key: "15to30m", label: "15-30 min", maxSeconds: 1800 },
  { key: "30to60m", label: "30-60 min", maxSeconds: 3600 },
  { key: "1to2h", label: "1-2 h", maxSeconds: 7200 },
  { key: "2to4h", label: "2-4 h", maxSeconds: 14400 },
  { key: "4to12h", label: "4-12 h", maxSeconds: 43200 },
  { key: "gt12h", label: "> 12 h", maxSeconds: null },
] as const;

export type DurationBucketKey = (typeof DURATION_BUCKETS)[number]["key"];

export interface DurationSegment extends SegmentMetrics {
  bucket: DurationBucketKey;
  label: string;
}

/** Riempie tutti i bucket nell'ordine crescente di durata. */
export function fillDurationSegments(
  rows: (SegmentAggregates & { bucket: string })[],
): DurationSegment[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  return DURATION_BUCKETS.map((b) => {
    const row = byBucket.get(b.key) ?? emptyAggregates();
    return { bucket: b.key, label: b.label, ...segmentMetrics(row) };
  });
}

/** Il segmento migliore e il peggiore per una metrica, ignorando i vuoti. */
export function bestAndWorst<T extends SegmentMetrics & { label: string }>(
  segments: T[],
  pick: (s: T) => string | null,
  options: { includeSmallSamples?: boolean } = {},
): { best: T | null; worst: T | null } {
  const usable = segments.filter(
    (s) =>
      !s.empty &&
      pick(s) !== null &&
      (options.includeSmallSamples || !s.smallSample),
  );
  if (usable.length === 0) return { best: null, worst: null };

  let best = usable[0];
  let worst = usable[0];
  for (const s of usable) {
    if (new Decimal(pick(s)!).gt(pick(best)!)) best = s;
    if (new Decimal(pick(s)!).lt(pick(worst)!)) worst = s;
  }
  return { best, worst };
}

export const hourPerformanceInfo: MetricInfoData = {
  label: "Performance per fascia oraria",
  description:
    "Come rende ogni ora della giornata, sull'orario di APERTURA del trade nel tuo fuso. Le fasce con pochi trade sono marcate: tre operazioni non fanno una statistica, e il modo più facile per peggiorare è cambiare le proprie abitudini inseguendo il rumore.",
  formula: "Ora di apertura (fuso utente) · Expectancy = Σ R / trade con rischio",
};

export const durationPerformanceInfo: MetricInfoData = {
  label: "Performance per durata",
  description:
    "Come rende il trade al variare di quanto lo tieni aperto (uscita − apertura). Serve a verificare un'ipotesi comune — «i trade che tengo troppo vanno peggio» — sui dati invece che a sensazione: la risposta può benissimo essere il contrario.",
  formula: "Durata = chiusura − apertura · fasce ricalibrate sui dati reali",
};
