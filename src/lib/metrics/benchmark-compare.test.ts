import { describe, expect, it } from "vitest";
import {
  benchmarkCoverage,
  benchmarkRows,
  BENCHMARK_MIN_BARS,
  type InstrumentWindow,
  type SymbolTrading,
} from "./benchmark-compare";

const trading = (
  symbol: string,
  over: Partial<SymbolTrading> = {},
): SymbolTrading => ({
  symbol,
  trades: 100,
  netPnl: "5000.00",
  avgQuantity: "2",
  pointValue: "50",
  ...over,
});

const window_ = (
  instrument: string,
  first: string,
  last: string,
  bars = 200,
): InstrumentWindow => ({ instrument, firstClose: first, lastClose: last, bars });

const mapper = (map: Record<string, string>) => (s: string) => map[s] ?? null;

describe("benchmarkRows — il tuo trading contro lo stare fermo", () => {
  it("caso a mano: +100 punti × 2 contratti × 50 = 10.000 di buy & hold", () => {
    const [row] = benchmarkRows(
      [trading("ES")],
      new Map([["SPX", window_("SPX", "5000", "5100")]]),
      mapper({ ES: "SPX" }),
    );
    expect(row.covered).toBe(true);
    expect(row.buyHold).toBe("10000.00");
    // 100/5000 = +2%
    expect(Number(row.changePct)).toBeCloseTo(0.02, 6);
    // 5.000 realizzati contro 10.000 di buy & hold: il trading NON batte.
    expect(row.beatsBuyHold).toBe(false);
  });

  it("mercato in calo: il buy & hold è negativo e battere è più facile", () => {
    const [row] = benchmarkRows(
      [trading("ES", { netPnl: "500.00" })],
      new Map([["SPX", window_("SPX", "5000", "4800")]]),
      mapper({ ES: "SPX" }),
    );
    expect(row.buyHold).toBe("-20000.00");
    expect(row.beatsBuyHold).toBe(true);
    expect(Number(row.changePct)).toBeCloseTo(-0.04, 6);
  });

  it("simbolo senza serie: nessun numero stimato, la riga lo dichiara", () => {
    const [row] = benchmarkRows(
      [trading("NQ")],
      new Map([["SPX", window_("SPX", "5000", "5100")]]),
      mapper({ ES: "SPX" }),
    );
    expect(row.covered).toBe(false);
    expect(row.instrument).toBeNull();
    expect(row.buyHold).toBeNull();
    expect(row.changePct).toBeNull();
    expect(row.beatsBuyHold).toBeNull();
    // Il P&L dell'utente resta: quello lo conosciamo comunque.
    expect(row.netPnl).toBe("5000.00");
  });

  it("serie troppo corta nella finestra → non coperta, e le barre si dichiarano", () => {
    const [row] = benchmarkRows(
      [trading("ES")],
      new Map([["SPX", window_("SPX", "5000", "5100", BENCHMARK_MIN_BARS - 1)]]),
      mapper({ ES: "SPX" }),
    );
    expect(row.covered).toBe(false);
    expect(row.bars).toBe(BENCHMARK_MIN_BARS - 1);
  });

  it("prima chiusura non positiva → nessuna percentuale, mai un infinito", () => {
    const [row] = benchmarkRows(
      [trading("ES")],
      new Map([["SPX", window_("SPX", "0", "5100")]]),
      mapper({ ES: "SPX" }),
    );
    expect(row.covered).toBe(false);
    expect(row.changePct).toBeNull();
  });

  it("la copertura si misura in TRADE, non in simboli", () => {
    const rows = benchmarkRows(
      [
        trading("ES", { trades: 300 }),
        trading("NQ", { trades: 100 }),
      ],
      new Map([["SPX", window_("SPX", "5000", "5100")]]),
      mapper({ ES: "SPX" }),
    );
    const coverage = benchmarkCoverage(rows);
    expect(coverage.total).toBe(400);
    expect(coverage.covered).toBe(300);
    expect(Number(coverage.share)).toBeCloseTo(0.75, 4);
  });

  it("nessun trade → copertura senza quota, mai una divisione per zero", () => {
    expect(benchmarkCoverage([]).share).toBeNull();
  });
});
