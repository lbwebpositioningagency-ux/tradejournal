import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { SESSION_TIMEZONE, SESSION_WINDOWS } from "@/lib/sessions";
import type { DayFacts } from "@/lib/discipline/evaluate";

/**
 * FATTI GIORNALIERI DELLA DISCIPLINA — la parte SQL del Progress Tracker.
 *
 * Il database riduce i trade a una riga per giornata (fuso dell'utente) con
 * conteggi, minimi e massimi che non dipendono da nessuna soglia: le soglie
 * le applica `lib/discipline/evaluate.ts`. In JS arrivano giornate, mai trade.
 *
 * Due giornate per ogni trade (decisione del 16/09/2026): il giorno di
 * APERTURA per le regole d'ingresso (stop, rischio, R/R, orario, numero di
 * trade, pausa, posizioni, size) e il giorno di CHIUSURA per quelle sulle
 * perdite. Un trade overnight entra in due giornate diverse.
 *
 * Nessun filtro di periodo, di proposito: una streak «in corso» tagliata dal
 * periodo sarebbe falsa. Il periodo si applica dopo, alle giornate valutate.
 *
 * Formule che esistono già altrove e qui sono ripetute in SQL (un test di
 * integrazione le confronta col TypeScript su SIM1):
 * - stop valido e R realizzato sui prezzi = `metrics/plan.ts`;
 * - fasce di sessione in ora italiana = `lib/sessions.ts`.
 *
 * Costo: pausa e posizioni aperte insieme confrontano ogni apertura con i
 * trade dello scope (subquery correlata). Per migliaia di trade è immediato;
 * oltre le decine di migliaia andrà riscritto con una finestra ordinata.
 */

export interface DisciplineScope {
  userId: string;
  accountId: string;
  /** Valuta attiva: i fatti non mescolano mai valute diverse. */
  currency?: string;
  timezone: string;
}

interface DayFactsRow {
  day: string;
  opened: number;
  missingStop: number;
  maxPlannedRisk: string | null;
  minTargetR: string | null;
  asia: number;
  london: number;
  newyork: number;
  off: number;
  lossBeforeOpenSameDay: boolean;
  minMinutesAfterLoss: string | null;
  maxOpenPositions: number;
  maxQuantityBySymbol: Record<string, string> | null;
  closed: number;
  netPnl: string;
  worstTradeNet: string | null;
  lossesWithStop: number;
  worstLossPriceR: string | null;
  maxConsecutiveLosses: number;
}

export async function getDisciplineDayFacts(scope: DisciplineScope): Promise<DayFacts[]> {
  const [asia, london, ny] = SESSION_WINDOWS;
  const where: Prisma.Sql[] = [Prisma.sql`a."userId" = ${scope.userId}`];
  if (scope.accountId !== ALL_ACCOUNTS) {
    where.push(Prisma.sql`t."tradingAccountId" = ${scope.accountId}`);
  } else {
    where.push(Prisma.sql`a."isArchived" = false`);
  }
  if (scope.currency) where.push(Prisma.sql`a."currency" = ${scope.currency}`);

  const rows = await prisma.$queryRaw<DayFactsRow[]>(Prisma.sql`
    WITH s AS MATERIALIZED (
      SELECT
        t."id", t."openedAt", t."closedAt", t."status", t."symbol", t."quantity",
        t."netPnl", t."initialRisk", t."targetR", t."avgExitPrice",
        CASE WHEN t."direction" = 'LONG' THEN 1 ELSE -1 END AS sgn,
        t."avgEntryPrice" AS entry, t."plannedStop" AS stop,
        to_char(((t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timezone})::date, 'YYYY-MM-DD') AS open_day,
        CASE WHEN t."closedAt" IS NULL THEN NULL
             ELSE to_char(((t."closedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timezone})::date, 'YYYY-MM-DD') END AS close_day,
        (EXTRACT(HOUR FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${SESSION_TIMEZONE}) * 60
          + EXTRACT(MINUTE FROM (t."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${SESSION_TIMEZONE})) AS open_min_it
      FROM "Trade" t
      JOIN "TradingAccount" a ON a."id" = t."tradingAccountId"
      WHERE ${Prisma.join(where, " AND ")}
    ),
    v AS (
      -- Rischio in punti prezzo: positivo solo se lo stop è dal lato giusto (plan.ts).
      SELECT s.*, (s.entry - s.stop) * s.sgn AS risk_pts,
        (s."status" = 'CLOSED' AND s."closedAt" IS NOT NULL) AS is_closed
      FROM s
    ),
    per_open AS (
      SELECT o."id", o.open_day,
        (SELECT max(p."closedAt") FROM v p
          WHERE p.is_closed AND p."netPnl" < 0 AND p."id" <> o."id" AND p."closedAt" <= o."openedAt") AS last_loss_close,
        (SELECT count(*) FROM v p
          WHERE p."id" <> o."id" AND p."openedAt" <= o."openedAt"
            AND (p."closedAt" IS NULL OR p."closedAt" > o."openedAt"))::int + 1 AS open_positions
      FROM v o
    ),
    opened AS (
      SELECT v.open_day AS day,
        count(*)::int AS opened,
        count(*) FILTER (WHERE v.stop IS NULL OR v.risk_pts <= 0)::int AS "missingStop",
        max(v."initialRisk") FILTER (WHERE v."initialRisk" > 0)::text AS "maxPlannedRisk",
        min(v."targetR")::text AS "minTargetR",
        count(*) FILTER (WHERE v.open_min_it < ${asia.endMin})::int AS asia,
        count(*) FILTER (WHERE v.open_min_it >= ${london.startMin} AND v.open_min_it < ${london.endMin})::int AS london,
        count(*) FILTER (WHERE v.open_min_it >= ${ny.startMin} AND v.open_min_it < ${ny.endMin})::int AS newyork,
        count(*) FILTER (WHERE v.open_min_it >= ${ny.endMin})::int AS off,
        coalesce(bool_or(
          po.last_loss_close IS NOT NULL
          AND to_char(((po.last_loss_close AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timezone})::date, 'YYYY-MM-DD') = v.open_day
        ), false) AS "lossBeforeOpenSameDay",
        min(EXTRACT(EPOCH FROM (v."openedAt" - po.last_loss_close)) / 60)::text AS "minMinutesAfterLoss",
        max(po.open_positions)::int AS "maxOpenPositions"
      FROM v JOIN per_open po ON po."id" = v."id"
      GROUP BY v.open_day
    ),
    qty AS (
      SELECT day, jsonb_object_agg(symbol, q) AS "maxQuantityBySymbol"
      FROM (SELECT open_day AS day, "symbol" AS symbol, max("quantity")::text AS q FROM v GROUP BY 1, 2) x
      GROUP BY day
    ),
    closed AS (
      SELECT v.close_day AS day,
        count(*)::int AS closed,
        sum(v."netPnl")::text AS "netPnl",
        min(v."netPnl")::text AS "worstTradeNet",
        count(*) FILTER (WHERE v."netPnl" < 0 AND v.risk_pts > 0 AND v."avgExitPrice" IS NOT NULL)::int AS "lossesWithStop",
        min((v."avgExitPrice" - v.entry) * v.sgn / v.risk_pts)
          FILTER (WHERE v."netPnl" < 0 AND v.risk_pts > 0 AND v."avgExitPrice" IS NOT NULL)::text AS "worstLossPriceR"
      FROM v WHERE v.is_closed
      GROUP BY v.close_day
    ),
    runs AS (
      -- Serie di perdite consecutive nella giornata (isole per differenza di rango).
      SELECT day, max(n)::int AS "maxConsecutiveLosses"
      FROM (
        SELECT day, grp, count(*) AS n
        FROM (
          SELECT v.close_day AS day, v."netPnl" < 0 AS loss,
            row_number() OVER (PARTITION BY v.close_day ORDER BY v."closedAt", v."id")
              - row_number() OVER (PARTITION BY v.close_day, v."netPnl" < 0 ORDER BY v."closedAt", v."id") AS grp
          FROM v WHERE v.is_closed
        ) r
        WHERE loss
        GROUP BY day, grp
      ) g
      GROUP BY day
    )
    SELECT
      coalesce(o.day, c.day) AS day,
      coalesce(o.opened, 0) AS opened,
      coalesce(o."missingStop", 0) AS "missingStop",
      o."maxPlannedRisk", o."minTargetR",
      coalesce(o.asia, 0) AS asia, coalesce(o.london, 0) AS london,
      coalesce(o.newyork, 0) AS newyork, coalesce(o.off, 0) AS off,
      coalesce(o."lossBeforeOpenSameDay", false) AS "lossBeforeOpenSameDay",
      o."minMinutesAfterLoss",
      coalesce(o."maxOpenPositions", 0) AS "maxOpenPositions",
      q."maxQuantityBySymbol",
      coalesce(c.closed, 0) AS closed,
      coalesce(c."netPnl", '0') AS "netPnl",
      c."worstTradeNet",
      coalesce(c."lossesWithStop", 0) AS "lossesWithStop",
      c."worstLossPriceR",
      coalesce(r."maxConsecutiveLosses", 0) AS "maxConsecutiveLosses"
    FROM opened o
    FULL OUTER JOIN closed c ON c.day = o.day
    LEFT JOIN qty q ON q.day = coalesce(o.day, c.day)
    LEFT JOIN runs r ON r.day = coalesce(o.day, c.day)
    ORDER BY 1
  `);

  return rows.map((r) => ({
    day: r.day,
    opened: r.opened,
    missingStop: r.missingStop,
    maxPlannedRisk: r.maxPlannedRisk,
    minTargetR: r.minTargetR,
    openedBySession: { ASIA: r.asia, LONDON: r.london, NEWYORK: r.newyork, OFF: r.off },
    lossBeforeOpenSameDay: r.lossBeforeOpenSameDay,
    minMinutesAfterLoss: r.minMinutesAfterLoss,
    maxOpenPositions: r.maxOpenPositions,
    maxQuantityBySymbol: r.maxQuantityBySymbol ?? {},
    closed: r.closed,
    netPnl: r.netPnl,
    worstTradeNet: r.worstTradeNet,
    lossesWithStop: r.lossesWithStop,
    worstLossPriceR: r.worstLossPriceR,
    maxConsecutiveLosses: r.maxConsecutiveLosses,
  }));
}
