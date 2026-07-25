import { describe, expect, it } from "vitest";
import {
  computeTrade,
  plannedRiskFromStop,
  TradeComputeError,
  type ExecutionInput,
} from "./trade-compute";

function exec(
  side: "BUY" | "SELL",
  quantity: string,
  price: string,
  at: string,
  fee = "0",
): ExecutionInput {
  return { side, quantity, price, fee, executedAt: new Date(at) };
}

describe("computeTrade — long semplice", () => {
  it("calcola un long chiuso in profitto", () => {
    const result = computeTrade([
      exec("BUY", "100", "10.00", "2026-07-01T09:30:00Z", "1.50"),
      exec("SELL", "100", "11.00", "2026-07-01T10:15:00Z", "1.50"),
    ]);
    expect(result.direction).toBe("LONG");
    expect(result.status).toBe("CLOSED");
    expect(result.quantity).toBe("100.00000000");
    expect(result.avgEntryPrice).toBe("10.00000000");
    expect(result.avgExitPrice).toBe("11.00000000");
    expect(result.grossPnl).toBe("100.00");
    expect(result.fees).toBe("3.00");
    expect(result.netPnl).toBe("97.00");
    expect(result.openedAt.toISOString()).toBe("2026-07-01T09:30:00.000Z");
    expect(result.closedAt?.toISOString()).toBe("2026-07-01T10:15:00.000Z");
  });

  it("calcola un long chiuso in perdita", () => {
    const result = computeTrade([
      exec("BUY", "50", "20.00", "2026-07-01T09:00:00Z"),
      exec("SELL", "50", "19.00", "2026-07-01T09:30:00Z"),
    ]);
    expect(result.netPnl).toBe("-50.00");
  });
});

describe("computeTrade — short", () => {
  it("uno short in profitto quando il prezzo scende", () => {
    const result = computeTrade([
      exec("SELL", "10", "100.00", "2026-07-01T09:00:00Z"),
      exec("BUY", "10", "95.00", "2026-07-01T11:00:00Z"),
    ]);
    expect(result.direction).toBe("SHORT");
    expect(result.grossPnl).toBe("50.00");
  });

  it("uno short in perdita quando il prezzo sale", () => {
    const result = computeTrade([
      exec("SELL", "10", "100.00", "2026-07-01T09:00:00Z"),
      exec("BUY", "10", "103.00", "2026-07-01T11:00:00Z"),
    ]);
    expect(result.grossPnl).toBe("-30.00");
  });
});

describe("computeTrade — esecuzioni multiple (scale-in/scale-out)", () => {
  it("media i prezzi di ingresso e uscita", () => {
    const result = computeTrade([
      exec("BUY", "100", "10.00", "2026-07-01T09:00:00Z"),
      exec("BUY", "100", "12.00", "2026-07-01T09:30:00Z"),
      exec("SELL", "200", "13.00", "2026-07-01T10:00:00Z"),
    ]);
    expect(result.avgEntryPrice).toBe("11.00000000");
    expect(result.quantity).toBe("200.00000000");
    expect(result.grossPnl).toBe("400.00"); // 200 × (13 − 11)
  });

  it("gestisce l'uscita parziale: trade ancora OPEN con P&L realizzato", () => {
    const result = computeTrade([
      exec("BUY", "300", "50.00", "2026-07-01T09:00:00Z"),
      exec("SELL", "100", "55.00", "2026-07-01T10:00:00Z"),
    ]);
    expect(result.status).toBe("OPEN");
    expect(result.closedAt).toBeNull();
    expect(result.grossPnl).toBe("500.00"); // 100 × 5
    expect(result.avgExitPrice).toBe("55.00000000");
  });

  it("ordina le esecuzioni per data anche se arrivano in disordine", () => {
    const result = computeTrade([
      exec("SELL", "10", "11.00", "2026-07-01T10:00:00Z"),
      exec("BUY", "10", "10.00", "2026-07-01T09:00:00Z"),
    ]);
    expect(result.direction).toBe("LONG");
    expect(result.grossPnl).toBe("10.00");
  });
});

describe("computeTrade — pointValue", () => {
  it("applica il moltiplicatore dei futures (ES = 50)", () => {
    const result = computeTrade(
      [
        exec("BUY", "2", "5000.00", "2026-07-01T09:00:00Z", "4.20"),
        exec("SELL", "2", "5010.00", "2026-07-01T10:00:00Z", "4.20"),
      ],
      { pointValue: "50" },
    );
    expect(result.grossPnl).toBe("1000.00"); // 10 punti × 2 contratti × 50
    expect(result.netPnl).toBe("991.60");
  });

  it("applica il lotto forex (0.5 lotti EURUSD, pip value su 100000)", () => {
    const result = computeTrade(
      [
        exec("BUY", "0.5", "1.08500", "2026-07-01T09:00:00Z"),
        exec("SELL", "0.5", "1.09000", "2026-07-01T12:00:00Z"),
      ],
      { pointValue: "100000" },
    );
    expect(result.grossPnl).toBe("250.00"); // 0.0050 × 0.5 × 100000
  });

  it("rifiuta pointValue nullo o negativo", () => {
    expect(() =>
      computeTrade([exec("BUY", "1", "10", "2026-07-01T09:00:00Z")], {
        pointValue: "0",
      }),
    ).toThrow(TradeComputeError);
  });
});

describe("computeTrade — R-multiple", () => {
  it("calcola R = netPnl / rischio", () => {
    const result = computeTrade(
      [
        exec("BUY", "100", "10.00", "2026-07-01T09:00:00Z"),
        exec("SELL", "100", "11.00", "2026-07-01T10:00:00Z"),
      ],
      { initialRisk: "50" },
    );
    expect(result.rMultiple).toBe("2.0000");
  });

  it("R negativo per una perdita", () => {
    const result = computeTrade(
      [
        exec("BUY", "100", "10.00", "2026-07-01T09:00:00Z"),
        exec("SELL", "100", "9.50", "2026-07-01T10:00:00Z"),
      ],
      { initialRisk: "100" },
    );
    expect(result.rMultiple).toBe("-0.5000");
  });

  it("R fuori capienza colonna Decimal(10,4) → errore pulito, non 500", () => {
    // netPnl 100000 / rischio 0.01 = R 10.000.000 > 999999.9999
    expect(() =>
      computeTrade(
        [
          exec("BUY", "100", "10.00", "2026-07-01T09:00:00Z"),
          exec("SELL", "100", "1010.00", "2026-07-01T10:00:00Z"),
        ],
        { initialRisk: "0.01" },
      ),
    ).toThrow(/fuori scala/);
  });

  it("null senza rischio; errore con rischio zero (divisione per zero)", () => {
    const executions = [
      exec("BUY", "100", "10.00", "2026-07-01T09:00:00Z"),
      exec("SELL", "100", "11.00", "2026-07-01T10:00:00Z"),
    ];
    expect(computeTrade(executions).rMultiple).toBeNull();
    expect(computeTrade(executions, { initialRisk: null }).rMultiple).toBeNull();
    expect(computeTrade(executions, { initialRisk: "" }).rMultiple).toBeNull();
    expect(() => computeTrade(executions, { initialRisk: "0" })).toThrow(
      TradeComputeError,
    );
  });
});

describe("computeTrade — precisione decimale", () => {
  it("non accumula errori floating point (0.1 + 0.2)", () => {
    const result = computeTrade([
      exec("BUY", "0.1", "3000.00", "2026-07-01T09:00:00Z"),
      exec("BUY", "0.2", "3000.00", "2026-07-01T09:30:00Z"),
      exec("SELL", "0.3", "3100.00", "2026-07-01T10:00:00Z"),
    ]);
    expect(result.quantity).toBe("0.30000000"); // non 0.30000000000000004
    expect(result.grossPnl).toBe("30.00");
  });

  it("arrotonda i prezzi medi periodici a 8 decimali", () => {
    const result = computeTrade([
      exec("BUY", "3", "10.00", "2026-07-01T09:00:00Z"),
      exec("BUY", "3", "10.01", "2026-07-01T09:10:00Z"),
      exec("BUY", "3", "10.01", "2026-07-01T09:20:00Z"),
    ]);
    // (30 + 30.03 + 30.03) / 9 = 10.00666666…
    expect(result.avgEntryPrice).toBe("10.00666667");
  });
});

describe("computeTrade — validazioni", () => {
  it("rifiuta un trade senza esecuzioni", () => {
    expect(() => computeTrade([])).toThrow(TradeComputeError);
  });

  it("rifiuta il flip di direzione (vendere più di quanto comprato)", () => {
    expect(() =>
      computeTrade([
        exec("BUY", "100", "10.00", "2026-07-01T09:00:00Z"),
        exec("SELL", "150", "11.00", "2026-07-01T10:00:00Z"),
      ]),
    ).toThrow(/invertire direzione/);
  });

  it("rifiuta quantità o prezzi non positivi", () => {
    expect(() =>
      computeTrade([exec("BUY", "0", "10.00", "2026-07-01T09:00:00Z")]),
    ).toThrow(TradeComputeError);
    expect(() =>
      computeTrade([exec("BUY", "10", "-1", "2026-07-01T09:00:00Z")]),
    ).toThrow(TradeComputeError);
    expect(() =>
      computeTrade([exec("BUY", "abc", "10", "2026-07-01T09:00:00Z")]),
    ).toThrow(TradeComputeError);
  });

  it("rifiuta fee negative", () => {
    expect(() =>
      computeTrade([exec("BUY", "10", "10.00", "2026-07-01T09:00:00Z", "-2")]),
    ).toThrow(TradeComputeError);
  });

  it("un trade solo-ingresso è OPEN con P&L zero", () => {
    const result = computeTrade([
      exec("BUY", "10", "10.00", "2026-07-01T09:00:00Z", "1.00"),
    ]);
    expect(result.status).toBe("OPEN");
    expect(result.grossPnl).toBe("0.00");
    expect(result.netPnl).toBe("-1.00"); // solo fee
    expect(result.avgExitPrice).toBeNull();
  });
});

describe("plannedRiskFromStop (F17)", () => {
  it("|entry − stop| × qty × valore punto, arrotondato a 2 decimali", () => {
    expect(
      plannedRiskFromStop({
        entryPrice: "5600",
        plannedStop: "5590",
        quantity: "2",
        pointValue: "50",
      }),
    ).toBe("1000.00");
    // short: stop sopra l'entry, stesso valore assoluto
    expect(
      plannedRiskFromStop({
        entryPrice: "1.08500",
        plannedStop: "1.08650",
        quantity: "0.5",
        pointValue: "100000",
      }),
    ).toBe("75.00");
  });

  it("campi mancanti, non numerici o rischio nullo → null", () => {
    expect(
      plannedRiskFromStop({
        entryPrice: "",
        plannedStop: "5590",
        quantity: "2",
        pointValue: "50",
      }),
    ).toBeNull();
    expect(
      plannedRiskFromStop({
        entryPrice: "abc",
        plannedStop: "5590",
        quantity: "2",
        pointValue: "50",
      }),
    ).toBeNull();
    // stop = entry → rischio zero: mai suggerire 0
    expect(
      plannedRiskFromStop({
        entryPrice: "5600",
        plannedStop: "5600",
        quantity: "2",
        pointValue: "50",
      }),
    ).toBeNull();
    expect(
      plannedRiskFromStop({
        entryPrice: "5600",
        plannedStop: "5590",
        quantity: "0",
        pointValue: "50",
      }),
    ).toBeNull();
  });
});
