import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ALL_ACCOUNTS } from "@/lib/constants";
import type { DailyPnl, TradeAggregates, TradeOutcome } from "@/lib/metrics";

/**
 * Aggregazioni SQL per il motore metriche.
 *
 * Regole:
 * - le aggregazioni girano SEMPRE nel database (FILTER, date_trunc, GROUP BY):
 *   in JS arrivano solo serie già ridotte (giorni/settimane/mesi), mai trade;
 * - ogni query filtra per userId attraverso la JOIN con TradingAccount;
 * - contano solo i trade CHIUSI; il bucketing usa closedAt nel fuso utente.
 *   closedAt è un timestamp NAIVE salvato in UTC: serve il doppio passaggio
 *   `(ts AT TIME ZONE 'UTC') AT TIME ZONE utente` — il singolo AT TIME ZONE
 *   interpreta il valore come ora locale (conversione inversa) e dipende
 *   dalla timezone di sessione;
 * - i numerici tornano come ::text (stringhe decimali), mai float JS.
 */

export interface StatsFilter {
  userId: string;
  /** Id conto oppure ALL_ACCOUNTS per tutti i conti non archiviati. */
  accountId: string;
  /**
   * F6 — scope per valuta: in vista "Tutti i conti" con conti di valute
   * diverse, restringe l'aggregato a una sola valuta (mai sommare valute
   * diverse). Assente = nessun vincolo di valuta (conto singolo, o un'unica
   * valuta presente).
   */
  currency?: string;
  /** Intervallo opzionale su closedAt (UTC). */
  from?: Date;
  to?: Date;
}

/** Condizioni base riusate anche dai report (src/lib/queries/reports.ts). */
export function whereClosedTrades(filter: StatsFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`a."userId" = ${filter.userId}`,
    Prisma.sql`t."status" = 'CLOSED'`,
    Prisma.sql`t."closedAt" IS NOT NULL`,
  ];
  if (filter.accountId !== ALL_ACCOUNTS) {
    conditions.push(Prisma.sql`t."tradingAccountId" = ${filter.accountId}`);
  } else {
    conditions.push(Prisma.sql`a."isArchived" = false`);
  }
  if (filter.currency) {
    conditions.push(Prisma.sql`a."currency" = ${filter.currency}`);
  }
  if (filter.from) conditions.push(Prisma.sql`t."closedAt" >= ${filter.from}`);
  if (filter.to) conditions.push(Prisma.sql`t."closedAt" < ${filter.to}`);
  return Prisma.join(conditions, " AND ");
}

/** Totale per valuta (F6): P&L netto e n° trade chiusi per ogni valuta nello
 *  scope/periodo, per mostrare i totali affiancati senza mai sommarli. */
export interface CurrencyTotal {
  currency: string;
  netPnl: string;
  trades: number;
}

/**
 * Ripartisce i trade chiusi dello scope per valuta del conto (mai una somma
 * cross-valuta). Ignora un eventuale filtro `currency` per elencare TUTTE le
 * valute presenti. Ordina per numero di trade (valuta prevalente prima).
 */
export async function getCurrencyBreakdown(
  filter: StatsFilter,
): Promise<CurrencyTotal[]> {
  // Ignora un eventuale scope di valuta: vogliamo TUTTE le valute presenti.
  const scope: StatsFilter = { ...filter, currency: undefined };
  return prisma.$queryRaw<CurrencyTotal[]>(Prisma.sql`
    SELECT a."currency" AS "currency",
           COALESCE(SUM(t."netPnl"), 0)::text AS "netPnl",
           COUNT(*)::int AS "trades"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(scope)}
    GROUP BY a."currency"
    ORDER BY COUNT(*) DESC, a."currency" ASC
  `);
}

export const FROM_TRADES = Prisma.sql`
  FROM "Trade" t
  JOIN "TradingAccount" a ON a."id" = t."tradingAccountId"
`;

/**
 * W4 — tutti gli R-multiple dei trade chiusi dello scope (per il bootstrap
 * Monte Carlo). Solo la colonna che serve, come stringhe decimali.
 */
export async function getRMultiples(filter: StatsFilter): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ r: string }[]>(Prisma.sql`
    SELECT t."rMultiple"::text AS "r"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)} AND t."rMultiple" IS NOT NULL
  `);
  return rows.map((row) => row.r);
}

/** Riga della distribuzione R (F32): un bin da 0,5R, conteggiato in SQL. */
export interface RDistributionRow {
  /**
   * Indice bin = floor(R / 0.5), clampato a [-9, 8] (overflow "< −4R" /
   * "≥ 4R"); BE_BIN per i trade con R esattamente 0.
   */
  bin: number;
  count: number;
}

/** Bin sentinella per R = 0 (breakeven), colonna dedicata nel grafico. */
export const BE_BIN = -100;

/**
 * Istogramma degli R-multiple (F32): bin da 0,5R calcolati in SQL su TUTTI i
 * trade chiusi con rischio definito del periodo (mai limitato ai 200 della
 * sequenza). R = 0 va nel bin BE dedicato.
 */
export async function getRDistribution(
  filter: StatsFilter,
): Promise<RDistributionRow[]> {
  return prisma.$queryRaw<RDistributionRow[]>(Prisma.sql`
    SELECT
      CASE
        WHEN t."rMultiple" = 0 THEN ${BE_BIN}
        ELSE LEAST(GREATEST(FLOOR(t."rMultiple" / 0.5), -9), 8)
      END::int AS "bin",
      COUNT(*)::int AS "count"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)} AND t."rMultiple" IS NOT NULL
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

/**
 * Aggregati sull'R-multiple, limitati ai trade chiusi che hanno un rischio
 * iniziale definito (rMultiple non null). Servono alla vista R della
 * dashboard: le somme di R sono additive, i valori medi si derivano.
 */
export interface RAggregates {
  /** Trade con rMultiple valorizzato. */
  rCount: number;
  rWins: number;
  rLosses: number;
  rSum: string;
  /** Somma dei quadrati degli R (per la deviazione standard dell'SQN). */
  rSumSq: string;
  rWinSum: string;
  /** ≤ 0, col segno. */
  rLossSum: string;
}

/**
 * Estremi e durate per esito (card Winners/Losers): sempre aggregati SQL,
 * null (non 0 finto) quando non ci sono trade di quel segno.
 */
export interface ExtremesAggregates {
  /** Miglior vincita (netPnl massimo tra i positivi). */
  bestWin: string | null;
  /** Peggior perdita (netPnl minimo tra i negativi, col segno). */
  worstLoss: string | null;
  /** Miglior R tra i vincenti in R (max rMultiple > 0), per la vista R. */
  bestWinR: string | null;
  /** Peggior R tra i perdenti in R (min rMultiple < 0, col segno). */
  worstLossR: string | null;
  /** Durata media dei vincenti, in secondi (stringa decimale). */
  avgWinDurationSec: string | null;
  /** Durata media dei perdenti, in secondi. */
  avgLossDurationSec: string | null;
}

/** Aggregati complessivi sui trade chiusi, in una sola query. */
export async function getTradeAggregates(
  filter: StatsFilter,
): Promise<TradeAggregates & RAggregates & ExtremesAggregates> {
  const rows = await prisma.$queryRaw<
    (TradeAggregates & RAggregates & ExtremesAggregates)[]
  >(Prisma.sql`
    SELECT
      COUNT(*)::int                                            AS "total",
      (COUNT(*) FILTER (WHERE t."netPnl" > 0))::int            AS "wins",
      (COUNT(*) FILTER (WHERE t."netPnl" < 0))::int            AS "losses",
      (COUNT(*) FILTER (WHERE t."netPnl" = 0))::int            AS "breakevens",
      COALESCE(SUM(t."netPnl"), 0)::text                       AS "netPnl",
      COALESCE(SUM(t."netPnl") FILTER (WHERE t."netPnl" > 0), 0)::text AS "winSum",
      COALESCE(SUM(t."netPnl") FILTER (WHERE t."netPnl" < 0), 0)::text AS "lossSum",
      COALESCE(SUM(t."fees"), 0)::text                         AS "fees",
      (COUNT(*) FILTER (WHERE t."rMultiple" IS NOT NULL))::int AS "rCount",
      (COUNT(*) FILTER (WHERE t."rMultiple" > 0))::int         AS "rWins",
      (COUNT(*) FILTER (WHERE t."rMultiple" < 0))::int         AS "rLosses",
      COALESCE(SUM(t."rMultiple"), 0)::text                    AS "rSum",
      COALESCE(SUM(t."rMultiple" * t."rMultiple"), 0)::text    AS "rSumSq",
      COALESCE(SUM(t."rMultiple") FILTER (WHERE t."rMultiple" > 0), 0)::text AS "rWinSum",
      COALESCE(SUM(t."rMultiple") FILTER (WHERE t."rMultiple" < 0), 0)::text AS "rLossSum",
      (MAX(t."netPnl") FILTER (WHERE t."netPnl" > 0))::text AS "bestWin",
      (MIN(t."netPnl") FILTER (WHERE t."netPnl" < 0))::text AS "worstLoss",
      (MAX(t."rMultiple") FILTER (WHERE t."rMultiple" > 0))::text AS "bestWinR",
      (MIN(t."rMultiple") FILTER (WHERE t."rMultiple" < 0))::text AS "worstLossR",
      (AVG(EXTRACT(EPOCH FROM (t."closedAt" - t."openedAt")))
        FILTER (WHERE t."netPnl" > 0))::text AS "avgWinDurationSec",
      (AVG(EXTRACT(EPOCH FROM (t."closedAt" - t."openedAt")))
        FILTER (WHERE t."netPnl" < 0))::text AS "avgLossDurationSec"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
  `);
  return rows[0];
}

export interface TradeSequencePoint {
  netPnl: string;
  /** R-multiple del trade (null se senza rischio iniziale), per la vista R. */
  rMultiple: string | null;
  symbol: string;
  /** Chiusura ISO (UTC), per l'etichetta del tooltip. */
  closedAt: Date;
}

/**
 * Sequenza dei trade chiusi in ordine cronologico per il grafico "candele"
 * (una barra per trade). Serie LIMITATA agli ultimi `limit` trade e ridotta
 * a tre colonne: mai l'intera lista di trade in memoria.
 */
export async function getTradeSequence(
  filter: StatsFilter,
  limit = 200,
): Promise<TradeSequencePoint[]> {
  const rows = await prisma.$queryRaw<TradeSequencePoint[]>(Prisma.sql`
    SELECT "netPnl", "rMultiple", "symbol", "closedAt" FROM (
      SELECT t."netPnl"::text AS "netPnl", t."rMultiple"::text AS "rMultiple",
             t."symbol", t."closedAt",
             ROW_NUMBER() OVER (ORDER BY t."closedAt" DESC, t."id" DESC) AS "rn"
      ${FROM_TRADES}
      WHERE ${whereClosedTrades(filter)}
    ) last_n
    WHERE "rn" <= ${limit}
    ORDER BY "closedAt" ASC, "rn" DESC
  `);
  return rows;
}

/** DailyPnl arricchito con la somma degli R della giornata (vista R). */
export interface DailyPnlRow extends DailyPnl {
  rSum: string;
}

/**
 * P&L netto per giornata (fuso utente), in ordine cronologico crescente.
 * Serie già ridotta: al massimo un elemento per giorno operativo.
 */
export async function getDailyPnl(
  filter: StatsFilter,
  timezone: string,
): Promise<DailyPnlRow[]> {
  return prisma.$queryRaw<DailyPnlRow[]>(Prisma.sql`
    SELECT
      to_char((t."closedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS "day",
      COALESCE(SUM(t."netPnl"), 0)::text                           AS "netPnl",
      COUNT(*)::int                                                AS "trades",
      COALESCE(SUM(t."rMultiple"), 0)::text                        AS "rSum"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

export interface PeriodPnl {
  /** Primo giorno del periodo ("YYYY-MM-DD", fuso utente). */
  periodStart: string;
  netPnl: string;
  trades: number;
  wins: number;
}

/**
 * P&L aggregato per settimana (lunedì) o mese, nel fuso utente.
 */
export async function getPeriodPnl(
  filter: StatsFilter,
  timezone: string,
  period: "week" | "month",
): Promise<PeriodPnl[]> {
  const truncUnit = period === "week" ? Prisma.sql`'week'` : Prisma.sql`'month'`;
  return prisma.$queryRaw<PeriodPnl[]>(Prisma.sql`
    SELECT
      to_char(date_trunc(${truncUnit}, (t."closedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM-DD') AS "periodStart",
      COALESCE(SUM(t."netPnl"), 0)::text            AS "netPnl",
      COUNT(*)::int                                 AS "trades",
      (COUNT(*) FILTER (WHERE t."netPnl" > 0))::int AS "wins"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

/**
 * Esiti dei trade più recenti (dal più recente), per la streak corrente.
 * Trasferisce solo il segno del netPnl, non i trade. Tie-breaker su id come
 * nella streak SQL di reports.ts: stesso ordine anche con closedAt identici.
 */
export async function getRecentTradeOutcomes(
  filter: StatsFilter,
  limit = 200,
): Promise<TradeOutcome[]> {
  const rows = await prisma.$queryRaw<{ outcome: TradeOutcome }[]>(Prisma.sql`
    SELECT CASE
      WHEN t."netPnl" > 0 THEN 'WIN'
      WHEN t."netPnl" < 0 THEN 'LOSS'
      ELSE 'BREAKEVEN'
    END AS "outcome"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades(filter)}
    ORDER BY t."closedAt" DESC, t."id" DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => r.outcome);
}

/**
 * P&L netto di TUTTO lo storico chiuso del conto attivo, SENZA filtro periodo:
 * è la base del saldo conto reale (saldo iniziale + P&L storico), che non deve
 * mai dipendere dal periodo selezionato in dashboard.
 */
export async function getLifetimeNetPnl(
  filter: Pick<StatsFilter, "userId" | "accountId" | "currency">,
): Promise<string> {
  const rows = await prisma.$queryRaw<{ netPnl: string }[]>(Prisma.sql`
    SELECT COALESCE(SUM(t."netPnl"), 0)::text AS "netPnl"
    ${FROM_TRADES}
    WHERE ${whereClosedTrades({
      userId: filter.userId,
      accountId: filter.accountId,
      currency: filter.currency,
    })}
  `);
  return rows[0].netPnl;
}

/**
 * Somma dei saldi iniziali dei conti considerati: base della curva di equity
 * per il calcolo del drawdown percentuale.
 */
export async function getStartingBalance(filter: StatsFilter): Promise<string> {
  const rows = await prisma.$queryRaw<{ balance: string }[]>(Prisma.sql`
    SELECT COALESCE(SUM(a."initialBalance"), 0)::text AS "balance"
    FROM "TradingAccount" a
    WHERE a."userId" = ${filter.userId}
      AND ${
        filter.accountId !== ALL_ACCOUNTS
          ? Prisma.sql`a."id" = ${filter.accountId}`
          : Prisma.sql`a."isArchived" = false`
      }
      ${filter.currency ? Prisma.sql`AND a."currency" = ${filter.currency}` : Prisma.empty}
  `);
  return rows[0].balance;
}
