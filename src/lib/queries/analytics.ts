import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  FROM_TRADES,
  whereClosedTrades,
  type StatsFilter,
} from "@/lib/queries/stats";

/**
 * Aggregazioni per la pagina Analytics (§3 distribuzione dei ritorni per
 * target R). Stesse regole delle altre query del progetto: tutto in SQL,
 * filtro userId + conto + valuta + periodo dal frammento condiviso, e in JS
 * arrivano solo serie già ridotte, mai liste di trade.
 *
 * FONTE DI VERITÀ: l'R realizzato è `Trade.rMultiple` e il target R è
 * `Trade.targetR` — entrambi denormalizzati dalla pipeline (computeTrade →
 * metrics/plan.ts). Qui non si ricalcola nessuna delle due grandezze: si
 * raggruppa e si conta.
 */

/** Filtri propri della pagina Analytics, oltre a conto/valuta/periodo. */
export interface AnalyticsFilter extends StatsFilter {
  /** Simbolo esatto (maiuscolo) oppure assente per tutti. */
  symbol?: string;
  direction?: "LONG" | "SHORT";
}

function analyticsWhere(filter: AnalyticsFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [whereClosedTrades(filter)];
  if (filter.symbol) parts.push(Prisma.sql`t."symbol" = ${filter.symbol}`);
  if (filter.direction) {
    parts.push(Prisma.sql`t."direction"::text = ${filter.direction}`);
  }
  return Prisma.join(parts, " AND ");
}

/**
 * "Target raggiunto" è un fatto di PREZZO, non di P&L: il trade è uscito al
 * target pianificato o oltre. Definirlo sull'R monetario sarebbe fuorviante —
 * le fee lo tengono sempre appena sotto il target e l'hit-rate risulterebbe
 * sistematicamente più basso del vero.
 */
const HIT_TARGET = Prisma.sql`
  t."avgExitPrice" IS NOT NULL AND t."plannedTarget" IS NOT NULL AND (
    (t."direction" = 'LONG'  AND t."avgExitPrice" >= t."plannedTarget") OR
    (t."direction" = 'SHORT' AND t."avgExitPrice" <= t."plannedTarget")
  )
`;

/** Bucket di target R: ≤1R, 1-2R, 2-3R, >3R (estremi come da specifica). */
export const TARGET_R_BUCKETS = [
  { key: "le1", label: "≤ 1R", min: null, max: 1 },
  { key: "1to2", label: "1-2R", min: 1, max: 2 },
  { key: "2to3", label: "2-3R", min: 2, max: 3 },
  { key: "gt3", label: "> 3R", min: 3, max: null },
] as const;

export type TargetRBucketKey = (typeof TARGET_R_BUCKETS)[number]["key"];

export interface TargetRBucketRow {
  bucket: TargetRBucketKey;
  trades: number;
  /** Trade usciti al target pianificato o oltre (fatto di prezzo). */
  hits: number;
  /** Media dell'R realizzato (= expectancy in R del bucket). */
  avgR: string | null;
  /** Quartili dell'R realizzato, per il box plot. */
  p25: string | null;
  p50: string | null;
  p75: string | null;
  minR: string | null;
  maxR: string | null;
  /** Somma degli R: il contributo del bucket al risultato complessivo. */
  sumR: string | null;
}

/**
 * Statistiche dell'R REALIZZATO per bucket di target R: è la domanda della
 * §3 — puntare più lontano paga davvero, e a quale costo in hit-rate?
 */
export async function getTargetRBuckets(
  filter: AnalyticsFilter,
): Promise<TargetRBucketRow[]> {
  const rows = await prisma.$queryRaw<TargetRBucketRow[]>(Prisma.sql`
    SELECT
      CASE
        WHEN t."targetR" <= 1 THEN 'le1'
        WHEN t."targetR" <= 2 THEN '1to2'
        WHEN t."targetR" <= 3 THEN '2to3'
        ELSE 'gt3'
      END AS "bucket",
      COUNT(*)::int                                        AS "trades",
      (COUNT(*) FILTER (WHERE ${HIT_TARGET}))::int         AS "hits",
      AVG(t."rMultiple")::text                             AS "avgR",
      (percentile_cont(0.25) WITHIN GROUP (ORDER BY t."rMultiple"))::text AS "p25",
      (percentile_cont(0.50) WITHIN GROUP (ORDER BY t."rMultiple"))::text AS "p50",
      (percentile_cont(0.75) WITHIN GROUP (ORDER BY t."rMultiple"))::text AS "p75",
      MIN(t."rMultiple")::text                             AS "minR",
      MAX(t."rMultiple")::text                             AS "maxR",
      SUM(t."rMultiple")::text                             AS "sumR"
    ${FROM_TRADES}
    WHERE ${analyticsWhere(filter)}
      AND t."targetR" IS NOT NULL
      AND t."rMultiple" IS NOT NULL
    GROUP BY 1
  `);
  return rows;
}

/** Un punto dello scatter target R (x) vs R realizzato (y). */
export interface TargetVsRealizedPoint {
  targetR: string;
  realizedR: string;
  symbol: string;
  direction: string;
  /** True se l'uscita ha raggiunto il target (fatto di prezzo). */
  hit: boolean;
}

/**
 * Punti per lo scatter. Serie LIMITATA (`limit`): i grafici a dispersione
 * oltre qualche centinaio di punti diventano una macchia, e comunque non si
 * caricano liste di trade illimitate.
 */
export async function getTargetVsRealized(
  filter: AnalyticsFilter,
  limit = 600,
): Promise<TargetVsRealizedPoint[]> {
  return prisma.$queryRaw<TargetVsRealizedPoint[]>(Prisma.sql`
    SELECT "targetR", "realizedR", "symbol", "direction", "hit" FROM (
      SELECT
        t."targetR"::text   AS "targetR",
        t."rMultiple"::text AS "realizedR",
        t."symbol",
        t."direction"::text AS "direction",
        (${HIT_TARGET})     AS "hit",
        ROW_NUMBER() OVER (ORDER BY t."closedAt" DESC, t."id" DESC) AS "rn"
      ${FROM_TRADES}
      WHERE ${analyticsWhere(filter)}
        AND t."targetR" IS NOT NULL
        AND t."rMultiple" IS NOT NULL
    ) recenti
    WHERE "rn" <= ${limit}
    ORDER BY "targetR" ASC
  `);
}

/** Conteggi di copertura: quanti trade hanno un piano e quanti no. */
export interface PlanCoverage {
  /** Trade chiusi nello scope/periodo. */
  total: number;
  /** Con R realizzato (rischio definito). */
  withR: number;
  /** Con target R (piano completo e valido). */
  withTargetR: number;
}

/**
 * Copertura del piano. Serve a dichiarare in pagina quanti trade restano
 * fuori dalle distribuzioni in R — mai far credere che il campione sia
 * l'intero storico quando non lo è.
 */
export async function getPlanCoverage(
  filter: AnalyticsFilter,
): Promise<PlanCoverage> {
  const rows = await prisma.$queryRaw<PlanCoverage[]>(Prisma.sql`
    SELECT
      COUNT(*)::int                                          AS "total",
      (COUNT(*) FILTER (WHERE t."rMultiple" IS NOT NULL))::int AS "withR",
      (COUNT(*) FILTER (WHERE t."targetR" IS NOT NULL
                          AND t."rMultiple" IS NOT NULL))::int AS "withTargetR"
    ${FROM_TRADES}
    WHERE ${analyticsWhere(filter)}
  `);
  return rows[0];
}

/**
 * Istogramma dell'R realizzato a fasce di 0,5R sull'INTERO scope filtrato
 * (non solo i trade con piano): forma, moda e code della distribuzione.
 * Stessa convenzione di bin del widget dashboard (F32), qui però con i
 * filtri di simbolo e direzione della pagina Analytics.
 */
export interface RHistogramRow {
  bin: number;
  count: number;
}

/** Bin sentinella per R esattamente 0 (breakeven). */
export const BE_BIN = -100;

export async function getRHistogram(
  filter: AnalyticsFilter,
): Promise<RHistogramRow[]> {
  return prisma.$queryRaw<RHistogramRow[]>(Prisma.sql`
    SELECT
      CASE
        WHEN t."rMultiple" = 0 THEN ${BE_BIN}
        ELSE LEAST(GREATEST(FLOOR(t."rMultiple" / 0.5), -9), 8)
      END::int AS "bin",
      COUNT(*)::int AS "count"
    ${FROM_TRADES}
    WHERE ${analyticsWhere(filter)} AND t."rMultiple" IS NOT NULL
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

/** Simboli presenti nello scope, per popolare il filtro strumento. */
export async function getAnalyticsSymbols(
  filter: AnalyticsFilter,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ symbol: string }[]>(Prisma.sql`
    SELECT DISTINCT t."symbol"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    ORDER BY 1 ASC
  `);
  return rows.map((r) => r.symbol);
}

// ── §2/§3 — performance per fascia oraria e per durata ──────────────────

/**
 * Colonne aggregate condivise con i breakdown dei Reports: da queste si
 * derivano win rate, expectancy e R medio con gli STESSI moduli metrics già
 * testati. Qui non si calcola nessuna metrica, si raggruppa soltanto.
 */
const SEGMENT_COLUMNS = Prisma.sql`
  COUNT(*)::int                                            AS "total",
  (COUNT(*) FILTER (WHERE t."netPnl" > 0))::int            AS "wins",
  (COUNT(*) FILTER (WHERE t."netPnl" < 0))::int            AS "losses",
  (COUNT(*) FILTER (WHERE t."netPnl" = 0))::int            AS "breakevens",
  COALESCE(SUM(t."netPnl"), 0)::text                       AS "netPnl",
  COALESCE(SUM(t."netPnl") FILTER (WHERE t."netPnl" > 0), 0)::text AS "winSum",
  COALESCE(SUM(t."netPnl") FILTER (WHERE t."netPnl" < 0), 0)::text AS "lossSum",
  COALESCE(SUM(t."rMultiple"), 0)::text                    AS "rSum",
  (COUNT(*) FILTER (WHERE t."rMultiple" IS NOT NULL))::int AS "rCount"
`;

export interface SegmentAggregates {
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

export interface HourPerformanceRow extends SegmentAggregates {
  /** 0-23, ora di APERTURA del trade nel fuso dell'utente. */
  hour: number;
}

/**
 * §2 — performance per fascia oraria di UN'ORA sull'orario di APERTURA.
 *
 * FUSO: quello dell'utente (`User.timezone`), con il doppio `AT TIME ZONE`
 * che il progetto usa ovunque — `openedAt` è un timestamp naive salvato in
 * UTC, il singolo passaggio lo interpreterebbe come ora locale. È la stessa
 * convenzione del breakdown orario dei Reports, così le due viste non
 * possono raccontare cose diverse sullo stesso trade. La pagina dichiara il
 * fuso in chiaro: una fascia oraria senza fuso esplicito è fuorviante.
 */
export async function getHourPerformance(
  filter: AnalyticsFilter,
  timezone: string,
): Promise<HourPerformanceRow[]> {
  return prisma.$queryRaw<HourPerformanceRow[]>(Prisma.sql`
    SELECT
      EXTRACT(HOUR FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS "hour",
      ${SEGMENT_COLUMNS}
    ${FROM_TRADES}
    WHERE ${analyticsWhere(filter)}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

export interface DurationPerformanceRow extends SegmentAggregates {
  /** Chiave del bucket di durata (vedi DURATION_BUCKETS). */
  bucket: string;
}

/**
 * §3 — performance per durata del trade (uscita − apertura).
 *
 * I confini vivono in `metrics/segment-performance.ts` (unica fonte) e qui
 * vengono tradotti in un CASE: raggruppare in SQL evita di portare in JS la
 * durata di ogni trade.
 */
export async function getDurationPerformance(
  filter: AnalyticsFilter,
  buckets: readonly { key: string; maxSeconds: number | null }[],
): Promise<DurationPerformanceRow[]> {
  const duration = Prisma.sql`EXTRACT(EPOCH FROM (t."closedAt" - t."openedAt"))`;
  const cases = buckets
    .filter((b) => b.maxSeconds !== null)
    .map((b) => Prisma.sql`WHEN ${duration} < ${b.maxSeconds} THEN ${b.key}`);
  const last = buckets[buckets.length - 1].key;

  return prisma.$queryRaw<DurationPerformanceRow[]>(Prisma.sql`
    SELECT
      CASE ${Prisma.join(cases, " ")} ELSE ${last} END AS "bucket",
      ${SEGMENT_COLUMNS}
    ${FROM_TRADES}
    WHERE ${analyticsWhere(filter)} AND t."closedAt" IS NOT NULL
    GROUP BY 1
  `);
}
