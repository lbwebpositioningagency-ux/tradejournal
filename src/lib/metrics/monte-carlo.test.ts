import { describe, expect, it } from "vitest";
import {
  monteCarloR,
  MONTE_CARLO_MIN_TRADES,
  mulberry32,
} from "./monte-carlo";

const WINNING = Array.from({ length: 40 }, (_, i) =>
  i % 2 === 0 ? "1" : "-0.5",
); // media +0.25R a trade

describe("monteCarloR (W4)", () => {
  it("gate: sotto la soglia minima → null, mai proiezioni su 4 trade", () => {
    expect(monteCarloR(["1", "2", "-1"])).toBeNull();
    expect(
      monteCarloR(Array(MONTE_CARLO_MIN_TRADES - 1).fill("1")),
    ).toBeNull();
  });

  it("deterministico: stesso seed → stessa proiezione", () => {
    const a = monteCarloR(WINNING, { sims: 50, rng: mulberry32(1) });
    const b = monteCarloR(WINNING, { sims: 50, rng: mulberry32(1) });
    expect(a).toEqual(b);
  });

  it("sistema vincente: mediana positiva e percentili ordinati", () => {
    const result = monteCarloR(WINNING, { sims: 200 });
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(100);
    const last = result!.steps.at(-1)!;
    expect(last.p05).toBeLessThanOrEqual(last.p25);
    expect(last.p25).toBeLessThanOrEqual(last.p50);
    expect(last.p50).toBeLessThanOrEqual(last.p75);
    expect(last.p75).toBeLessThanOrEqual(last.p95);
    // media +0.25R × 100 trade → mediana attesa nell'intorno di +25R
    expect(last.p50).toBeGreaterThan(10);
    expect(Number(result!.medianFinalR)).toBeCloseTo(last.p50, 5);
  });

  it("sistema perdente: probabilità di finire in negativo alta", () => {
    const losing = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? "0.5" : "-1",
    );
    const result = monteCarloR(losing, { sims: 200 });
    expect(Number(result!.probNegative)).toBeGreaterThan(0.8);
    expect(Number(result!.medianMaxDrawdownR)).toBeGreaterThan(0);
  });

  it("valori non numerici scartati dal campione", () => {
    const dirty = [...WINNING, "abc", ""];
    const result = monteCarloR(dirty, { sims: 20 });
    expect(result!.sampleSize).toBe(40);
  });
});
