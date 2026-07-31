import { ASSET_CLASSES } from "@/lib/constants";

/**
 * Filtri della Trade View (FASE 7). Vivono nei searchParams (condivisibili,
 * SSR); il parsing è LENIENT: un valore non riconosciuto equivale a filtro
 * assente, mai un errore. Il filtro periodo è a parte (src/lib/period.ts).
 */

export const TRADE_DIRECTIONS = ["LONG", "SHORT"] as const;
export const TRADE_STATUSES = ["OPEN", "CLOSED"] as const;
export const TRADE_OUTCOMES = ["win", "loss", "be"] as const;

/** Sentinella per "trade senza strategia". */
export const NO_STRATEGY_FILTER = "none";

export interface TradeFilters {
  /** Ricerca simbolo (match parziale, case-insensitive). */
  symbol?: string;
  direction?: (typeof TRADE_DIRECTIONS)[number];
  status?: (typeof TRADE_STATUSES)[number];
  /** Esito dal segno del netPnl (i trade OPEN con P&L parziale contano). */
  outcome?: (typeof TRADE_OUTCOMES)[number];
  assetClass?: (typeof ASSET_CLASSES)[number];
  /** Id strategia, oppure NO_STRATEGY_FILTER per "senza strategia". */
  strategyId?: string;
  tagId?: string;
}

type RawParams = Record<string, string | string[] | undefined>;

/** I searchParams possono arrivare duplicati (array): tutto ciò che non è stringa = assente. */
function asString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function oneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const v = asString(value);
  return v !== undefined && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : undefined;
}

export function parseTradeFilters(params: RawParams): TradeFilters {
  const symbol = asString(params.symbol)?.trim().slice(0, 20);
  const id = (raw: string | string[] | undefined) => {
    const v = asString(raw);
    return v && v.length > 0 && v.length <= 64 ? v : undefined;
  };

  return {
    symbol: symbol ? symbol : undefined,
    direction: oneOf(params.dir, TRADE_DIRECTIONS),
    status: oneOf(params.status, TRADE_STATUSES),
    outcome: oneOf(params.outcome, TRADE_OUTCOMES),
    assetClass: oneOf(params.asset, ASSET_CLASSES),
    strategyId: id(params.strategy),
    tagId: id(params.tag),
  };
}

export function countActiveFilters(filters: TradeFilters): number {
  return Object.values(filters).filter((v) => v !== undefined).length;
}

// ── Ordinamento (F38): ?sort=<campo>.<asc|desc>, SSR via searchParams ──

export const TRADE_SORT_FIELDS = [
  "openedAt",
  "closedAt",
  "symbol",
  "quantity",
  "netPnl",
  "rMultiple",
] as const;
export type TradeSortField = (typeof TRADE_SORT_FIELDS)[number];

export interface TradeSort {
  field: TradeSortField;
  dir: "asc" | "desc";
}

export const DEFAULT_TRADE_SORT: TradeSort = { field: "openedAt", dir: "desc" };

/** Parsing LENIENT come i filtri: sort non riconosciuto = default. */
export function parseTradeSort(params: RawParams): TradeSort {
  const raw = asString(params.sort);
  if (!raw) return DEFAULT_TRADE_SORT;
  const [field, dir] = raw.split(".");
  if (
    !(TRADE_SORT_FIELDS as readonly string[]).includes(field) ||
    (dir !== "asc" && dir !== "desc")
  ) {
    return DEFAULT_TRADE_SORT;
  }
  return { field: field as TradeSortField, dir };
}

/**
 * orderBy Prisma per il sort scelto: i campi nullabili (closedAt sui trade
 * aperti, rMultiple senza rischio) mettono SEMPRE i null in fondo, qualunque
 * direzione; id come tie-break stabile per la paginazione.
 */
export function buildTradeOrderBy(
  sort: TradeSort,
): Record<string, unknown>[] {
  const nullable = sort.field === "closedAt" || sort.field === "rMultiple";
  const primary = nullable
    ? { [sort.field]: { sort: sort.dir, nulls: "last" } }
    : { [sort.field]: sort.dir };
  return [primary, { id: sort.dir }];
}

/**
 * Frammento di `where` Prisma per i filtri (da combinare con il filtro
 * account/userId, che resta SEMPRE responsabilità del chiamante).
 * Il periodo filtra su openedAt: la Trade View elenca i trade per apertura
 * (i CHIUSI nelle metriche/dashboard restano su closedAt).
 */
export function buildTradeFilterWhere(
  filters: TradeFilters,
  period: { from?: Date; to?: Date } = {},
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.symbol) {
    where.symbol = { contains: filters.symbol.toUpperCase() };
  }
  if (filters.direction) where.direction = filters.direction;
  if (filters.status) where.status = filters.status;
  if (filters.assetClass) where.assetClass = filters.assetClass;

  if (filters.outcome === "win") where.netPnl = { gt: "0" };
  else if (filters.outcome === "loss") where.netPnl = { lt: "0" };
  else if (filters.outcome === "be") where.netPnl = { equals: "0" };

  if (filters.strategyId === NO_STRATEGY_FILTER) {
    where.strategyId = null;
  } else if (filters.strategyId) {
    where.strategyId = filters.strategyId;
  }

  if (filters.tagId) {
    where.tags = { some: { tagId: filters.tagId } };
  }

  if (period.from || period.to) {
    where.openedAt = {
      ...(period.from ? { gte: period.from } : {}),
      ...(period.to ? { lt: period.to } : {}),
    };
  }

  return where;
}
