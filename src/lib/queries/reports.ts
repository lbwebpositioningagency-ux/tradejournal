import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  FROM_TRADES,
  whereClosedTrades,
  type StatsFilter,
} from "@/lib/queries/stats";
import { SESSION_WINDOWS, type SessionRow } from "@/lib/sessions";

/**
 * Aggregazioni SQL per i Reports (FASE 8). Stesse regole di stats.ts:
 * - GROUP BY nel database, in JS arrivano solo righe già ridotte;
 * - numerici come ::text (stringhe decimali), mai float JS;
 * - ogni query filtra per userId via JOIN e considera solo trade CHIUSI;
 * - conversioni di fuso SEMPRE col doppio AT TIME ZONE (timestamp naive UTC).
 *
 * I bucket orario/giorno usano openedAt (l'ORA DI INGRESSO nel fuso utente):
 * la domanda del report è "quando entro a mercato rendo meglio?"; il filtro
 * periodo resta su closedAt come in tutto il resto delle metriche.
 */

/** Aggregati comuni a ogni riga di breakdown. */
export interface BreakdownAggregates {
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPnl: string;
  winSum: string;
  /** ≤ 0, col segno. */
  lossSum: string;
  rSum: string;
  rCount: number;
}

const AGGREGATE_COLUMNS = Prisma.sql`
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

export interface StrategyBreakdownRow extends BreakdownAggregates {
  /** Id strategia, oppure null per i trade senza strategia. */
  strategyId: string | null;
  name: string;
  color: string | null;
}

/** Performance per strategia (inclusi i trade senza strategia). */
export async function getStrategyBreakdown(
  filter: StatsFilter,
): Promise<StrategyBreakdownRow[]> {
  return prisma.$queryRaw<StrategyBreakdownRow[]>(Prisma.sql`
    SELECT
      s."id"                                  AS "strategyId",
      COALESCE(s."name", 'Senza strategia')   AS "name",
      s."color"                               AS "color",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    LEFT JOIN "Strategy" s ON s."id" = t."strategyId"
    WHERE ${whereClosedTrades(filter)}
    GROUP BY s."id", s."name", s."color"
    ORDER BY SUM(t."netPnl") DESC
  `);
}

export interface TagBreakdownRow extends BreakdownAggregates {
  tagId: string;
  name: string;
  category: string;
}

/**
 * Performance per tag. Un trade può avere più tag: le righe si sovrappongono
 * (la somma dei netPnl per tag NON è il totale del conto).
 */
export async function getTagBreakdown(
  filter: StatsFilter,
): Promise<TagBreakdownRow[]> {
  return prisma.$queryRaw<TagBreakdownRow[]>(Prisma.sql`
    SELECT
      tg."id"       AS "tagId",
      tg."name"     AS "name",
      tg."category" AS "category",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    JOIN "TradeTag" tt ON tt."tradeId" = t."id"
    JOIN "Tag" tg      ON tg."id" = tt."tagId"
    WHERE ${whereClosedTrades(filter)}
    GROUP BY tg."id", tg."name", tg."category"
    ORDER BY SUM(t."netPnl") DESC
  `);
}

export interface SymbolBreakdownRow extends BreakdownAggregates {
  symbol: string;
}

/** Performance per simbolo (F30): il report #1 di qualunque journal. */
export async function getSymbolBreakdown(
  filter: StatsFilter,
): Promise<SymbolBreakdownRow[]> {
  return prisma.$queryRaw<SymbolBreakdownRow[]>(Prisma.sql`
    SELECT
      t."symbol" AS "symbol",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY t."symbol"
    ORDER BY SUM(t."netPnl") DESC
  `);
}

export interface DirectionAssetBreakdownRow extends BreakdownAggregates {
  direction: "LONG" | "SHORT";
  assetClass: string;
}

/** Performance per direzione × asset class (F30): long vs short, futures vs forex. */
export async function getDirectionAssetBreakdown(
  filter: StatsFilter,
): Promise<DirectionAssetBreakdownRow[]> {
  return prisma.$queryRaw<DirectionAssetBreakdownRow[]>(Prisma.sql`
    SELECT
      t."direction"::text  AS "direction",
      t."assetClass"::text AS "assetClass",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY t."direction", t."assetClass"
    ORDER BY SUM(t."netPnl") DESC
  `);
}

export interface MonthBreakdownRow extends BreakdownAggregates {
  /** Chiave mese "YYYY-MM" nel fuso utente (su closedAt, come le metriche). */
  month: string;
}

/**
 * Performance per mese di calendario (F30): l'unità dei payout e delle
 * challenge prop. Bucketing su closedAt nel fuso utente (doppio AT TIME ZONE),
 * mesi recenti per primi.
 */
export async function getMonthBreakdown(
  filter: StatsFilter,
  timezone: string,
): Promise<MonthBreakdownRow[]> {
  return prisma.$queryRaw<MonthBreakdownRow[]>(Prisma.sql`
    SELECT
      to_char((t."closedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM') AS "month",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY 1
    ORDER BY 1 DESC
  `);
}

export interface HourBreakdownRow extends BreakdownAggregates {
  /** 0-23, ora di APERTURA nel fuso utente. */
  hour: number;
}

export async function getHourBreakdown(
  filter: StatsFilter,
  timezone: string,
): Promise<HourBreakdownRow[]> {
  return prisma.$queryRaw<HourBreakdownRow[]>(Prisma.sql`
    SELECT
      EXTRACT(HOUR FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS "hour",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

export interface WeekdayBreakdownRow extends BreakdownAggregates {
  /** ISO: 1 = lunedì … 7 = domenica, giorno di APERTURA nel fuso utente. */
  weekday: number;
}

export async function getWeekdayBreakdown(
  filter: StatsFilter,
  timezone: string,
): Promise<WeekdayBreakdownRow[]> {
  return prisma.$queryRaw<WeekdayBreakdownRow[]>(Prisma.sql`
    SELECT
      EXTRACT(ISODOW FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS "weekday",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

/**
 * Breakdown per SESSIONE di mercato (F7): classificazione sull'ora di
 * APERTURA nel FUSO DELL'EXCHANGE (finestre e priorità da
 * src/lib/sessions.ts), col doppio AT TIME ZONE standard del progetto —
 * l'ora legale non sposta più i trade nella sessione sbagliata.
 */
export async function getSessionBreakdown(
  filter: StatsFilter,
): Promise<SessionRow[]> {
  // Minuti locali dell'exchange per ciascuna finestra, in ordine di priorità.
  const [ny, london, tokyo] = SESSION_WINDOWS;
  const localMinutes = (timezone: string) => Prisma.sql`
    (EXTRACT(HOUR FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) * 60
     + EXTRACT(MINUTE FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}))
  `;
  return prisma.$queryRaw<SessionRow[]>(Prisma.sql`
    SELECT
      CASE
        WHEN ${localMinutes(ny.timezone)} >= ${ny.startMin}
         AND ${localMinutes(ny.timezone)} < ${ny.endMin} THEN 'NEWYORK'
        WHEN ${localMinutes(london.timezone)} >= ${london.startMin}
         AND ${localMinutes(london.timezone)} < ${london.endMin} THEN 'LONDON'
        WHEN ${localMinutes(tokyo.timezone)} >= ${tokyo.startMin}
         AND ${localMinutes(tokyo.timezone)} < ${tokyo.endMin} THEN 'ASIA'
        ELSE 'OFF'
      END AS "session",
      ${AGGREGATE_COLUMNS}
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY 1
  `);
}

export interface StreakStats {
  maxWinStreak: number;
  maxLossStreak: number;
}

/**
 * Streak massime di trade consecutivi (win/loss) nel periodo, calcolate in
 * SQL con gaps-and-islands sull'ordine di chiusura: in JS arrivano due interi.
 * I breakeven spezzano entrambe le serie.
 */
export async function getStreakStats(filter: StatsFilter): Promise<StreakStats> {
  const rows = await prisma.$queryRaw<{ sign: number; maxstreak: number }[]>(Prisma.sql`
    WITH outcomes AS (
      SELECT
        CASE WHEN t."netPnl" > 0 THEN 1 WHEN t."netPnl" < 0 THEN -1 ELSE 0 END AS "sign",
        ROW_NUMBER() OVER (ORDER BY t."closedAt", t."id") AS "rn"
      ${FROM_TRADES}
      WHERE ${whereClosedTrades(filter)}
    ),
    islands AS (
      SELECT "sign", "rn" - ROW_NUMBER() OVER (PARTITION BY "sign" ORDER BY "rn") AS "grp"
      FROM outcomes
    )
    SELECT "sign", MAX("len")::int AS "maxstreak"
    FROM (
      SELECT "sign", "grp", COUNT(*) AS "len"
      FROM islands
      GROUP BY "sign", "grp"
    ) runs
    WHERE "sign" != 0
    GROUP BY "sign"
  `);

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  for (const row of rows) {
    if (row.sign === 1) maxWinStreak = row.maxstreak;
    if (row.sign === -1) maxLossStreak = row.maxstreak;
  }
  return { maxWinStreak, maxLossStreak };
}
