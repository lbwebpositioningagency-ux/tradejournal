import { describe, expect, it } from "vitest";
import {
  buildTradeFilterWhere,
  buildTradeOrderBy,
  countActiveFilters,
  DEFAULT_TRADE_SORT,
  NO_STRATEGY_FILTER,
  parseTradeFilters,
  parseTradeSort,
} from "./trade-filters";

describe("parseTradeFilters", () => {
  it("accetta valori validi", () => {
    const filters = parseTradeFilters({
      symbol: " es ",
      dir: "LONG",
      status: "CLOSED",
      outcome: "win",
      asset: "FUTURES",
      strategy: "str_1",
      tag: "tag_1",
    });
    expect(filters).toEqual({
      symbol: "es",
      direction: "LONG",
      status: "CLOSED",
      outcome: "win",
      assetClass: "FUTURES",
      strategyId: "str_1",
      tagId: "tag_1",
    });
    expect(countActiveFilters(filters)).toBe(7);
  });

  it("è lenient: valori sconosciuti = filtro assente, mai errore", () => {
    const filters = parseTradeFilters({
      dir: "SIDEWAYS",
      status: "MAYBE",
      outcome: "meh",
      asset: "BONDS",
      symbol: "   ",
    });
    expect(countActiveFilters(filters)).toBe(0);
  });

  it("nessun parametro → nessun filtro", () => {
    expect(countActiveFilters(parseTradeFilters({}))).toBe(0);
  });
});

describe("buildTradeFilterWhere", () => {
  it("simbolo: match parziale sul valore in maiuscolo", () => {
    expect(buildTradeFilterWhere({ symbol: "eur" })).toEqual({
      symbol: { contains: "EUR" },
    });
  });

  it("esito dal segno del netPnl", () => {
    expect(buildTradeFilterWhere({ outcome: "win" })).toEqual({
      netPnl: { gt: "0" },
    });
    expect(buildTradeFilterWhere({ outcome: "loss" })).toEqual({
      netPnl: { lt: "0" },
    });
    expect(buildTradeFilterWhere({ outcome: "be" })).toEqual({
      netPnl: { equals: "0" },
    });
  });

  it("strategia: id, oppure sentinella 'none' → strategyId null", () => {
    expect(buildTradeFilterWhere({ strategyId: "str_1" })).toEqual({
      strategyId: "str_1",
    });
    expect(buildTradeFilterWhere({ strategyId: NO_STRATEGY_FILTER })).toEqual({
      strategyId: null,
    });
  });

  it("tag via relazione some", () => {
    expect(buildTradeFilterWhere({ tagId: "tag_1" })).toEqual({
      tags: { some: { tagId: "tag_1" } },
    });
  });

  it("periodo su openedAt: from inclusivo, to esclusivo", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    const to = new Date("2026-07-16T00:00:00Z");
    expect(buildTradeFilterWhere({}, { from, to })).toEqual({
      openedAt: { gte: from, lt: to },
    });
    expect(buildTradeFilterWhere({}, { from })).toEqual({
      openedAt: { gte: from },
    });
    expect(buildTradeFilterWhere({}, {})).toEqual({});
  });

  it("filtri combinati non si sovrascrivono", () => {
    const where = buildTradeFilterWhere(
      { direction: "SHORT", status: "CLOSED", outcome: "loss" },
      { from: new Date("2026-07-01T00:00:00Z") },
    );
    expect(Object.keys(where).sort()).toEqual([
      "direction",
      "netPnl",
      "openedAt",
      "status",
    ]);
  });
});

describe("parseTradeSort (F38)", () => {
  it("campo.direzione validi", () => {
    expect(parseTradeSort({ sort: "netPnl.desc" })).toEqual({
      field: "netPnl",
      dir: "desc",
    });
    expect(parseTradeSort({ sort: "symbol.asc" })).toEqual({
      field: "symbol",
      dir: "asc",
    });
  });

  it("assente, invalido o array → default openedAt.desc", () => {
    expect(parseTradeSort({})).toEqual(DEFAULT_TRADE_SORT);
    expect(parseTradeSort({ sort: "banana.desc" })).toEqual(DEFAULT_TRADE_SORT);
    expect(parseTradeSort({ sort: "netPnl.sideways" })).toEqual(DEFAULT_TRADE_SORT);
    expect(parseTradeSort({ sort: ["netPnl.desc"] })).toEqual(DEFAULT_TRADE_SORT);
    // niente injection di campi arbitrari (es. id o relazioni)
    expect(parseTradeSort({ sort: "account.desc" })).toEqual(DEFAULT_TRADE_SORT);
  });
});

describe("buildTradeOrderBy (F38)", () => {
  it("campi non nullabili: ordinamento diretto + tie-break id", () => {
    expect(buildTradeOrderBy({ field: "openedAt", dir: "desc" })).toEqual([
      { openedAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("campi nullabili (closedAt, rMultiple): null sempre in fondo", () => {
    expect(buildTradeOrderBy({ field: "rMultiple", dir: "asc" })).toEqual([
      { rMultiple: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
    expect(buildTradeOrderBy({ field: "closedAt", dir: "desc" })).toEqual([
      { closedAt: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ]);
  });
});
