import { describe, expect, it } from "vitest";
import { groupEstimates } from "./group-estimates";

function gruppo(pnl: number[], r: (number | null)[]) {
  const wins = pnl.filter((v) => v > 0);
  const losses = pnl.filter((v) => v < 0);
  return {
    total: pnl.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: pnl.length - wins.length - losses.length,
    winSum: wins.reduce((a, b) => a + b, 0).toFixed(2),
    lossSum: losses.reduce((a, b) => a + b, 0).toFixed(2),
    pnlUnits: pnl.map((v) => String(Math.round(v * 100))),
    rUnits: r.filter((v): v is number => v !== null).map((v) => String(Math.round(v * 10000))),
  };
}

describe("groupEstimates", () => {
  it("zero trade: tutto insufficiente, nessuna divisione per zero", () => {
    const e = groupEstimates(gruppo([], []));
    expect(e.lowSample).toBe(true);
    expect(e.winRate.value).toBeNull();
    expect(e.expectancyCash.value).toBeNull();
    expect(e.breakEven).toBeNull();
  });

  it("il win rate si confronta col pareggio del gruppo, non con zero", () => {
    // 20 vincite da +200, 20 perdite da −100: payoff 2 → pareggio 1/3.
    const pnl = [...Array(20).fill(200), ...Array(20).fill(-100)];
    const e = groupEstimates(gruppo(pnl, pnl.map((v) => v / 100)));
    expect(e.breakEven).toBe("0.3333");
    expect(e.winRate.value).toBe("0.5000");
    expect(e.winRate.reference).toBe("0.3333");
    expect(e.expectancyCash.value).toBe("50.0000");
    expect(e.expectancyR.value).toBe("0.5000");
  });

  it("expectancy in R col suo campione: pochi trade con rischio → R insufficiente, valuta no", () => {
    const pnl = Array.from({ length: 40 }, (_, i) => (i % 2 ? 120 : -80));
    const r = pnl.map((v, i) => (i < 10 ? v / 100 : null));
    const e = groupEstimates(gruppo(pnl, r));
    expect(e.lowSample).toBe(false);
    expect(e.expectancyCash.lowSample).toBe(false);
    expect(e.expectancyR.lowSample).toBe(true);
    expect(e.expectancyR.n).toBe(10);
  });

  it("tutti in perdita: nessun pareggio definibile, expectancy negativa", () => {
    const pnl = Array.from({ length: 35 }, (_, i) => -50 - i);
    const e = groupEstimates(gruppo(pnl, pnl.map((v) => v / 100)));
    expect(e.breakEven).toBeNull();
    expect(e.winRate.value).toBe("0.0000");
    expect(e.winRate.distinct).toBeNull();
    expect(Number(e.expectancyCash.value)).toBeLessThan(0);
    expect(e.expectancyCash.distinct).toBe(true);
  });
});
