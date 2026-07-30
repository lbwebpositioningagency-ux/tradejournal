import { describe, expect, it } from "vitest";
import {
  SIM_MAX_LINES,
  SIM_MAX_TRADES,
  simulateEquityCurves,
  type EquitySimulatorInput,
} from "./equity-simulator";

/**
 * Il motore è deliberatamente in float (simulazione di visualizzazione, non
 * contabilità): i confronti usano toBeCloseTo dove entra l'aritmetica
 * binaria, e uguaglianza esatta dove il risultato è definito senza errore.
 */

const base: EquitySimulatorInput = {
  startEquity: 10000,
  winProbability: 0.5,
  winLossRatio: 1.5,
  trades: 100,
  lines: 20,
  riskMode: "percent",
  riskValue: 0.01,
  seed: 42,
};

describe("simulateEquityCurves — RNG deterministico", () => {
  it("stesso seed → stesso identico output", () => {
    const a = simulateEquityCurves(base);
    const b = simulateEquityCurves(base);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("seed diverso → percorsi diversi", () => {
    const a = simulateEquityCurves(base)!;
    const b = simulateEquityCurves({ ...base, seed: 43 })!;
    expect(a.paths).not.toEqual(b.paths);
  });

  it("dimensioni: `lines` percorsi da `trades`+1 punti, tutti da startEquity", () => {
    const result = simulateEquityCurves(base)!;
    expect(result.paths).toHaveLength(20);
    for (const path of result.paths) {
      expect(path).toHaveLength(101);
      expect(path[0]).toBe(10000);
    }
    expect(result.mean).toHaveLength(101);
    expect(result.mean[0]).toBe(10000);
  });
});

describe("simulateEquityCurves — compounding in % dell'equity corrente", () => {
  it("tutte vincite: equity = start × (1 + rischio × ratio)^n", () => {
    const result = simulateEquityCurves({
      ...base,
      winProbability: 1,
      winLossRatio: 2,
      riskValue: 0.01,
      trades: 10,
      lines: 1,
    })!;
    // 10000 × 1.02^10 — se il rischio fosse sull'equity INIZIALE il valore
    // sarebbe 10000 + 10 × 200 = 12000, non 12189.94…
    expect(result.paths[0][10]).toBeCloseTo(10000 * 1.02 ** 10, 6);
    expect(result.paths[0][10]).not.toBeCloseTo(12000, 0);
  });

  it("tutte perdite: equity = start × (1 − rischio)^n, mai zero", () => {
    const result = simulateEquityCurves({
      ...base,
      winProbability: 0,
      riskValue: 0.02,
      trades: 50,
      lines: 1,
    })!;
    expect(result.paths[0][50]).toBeCloseTo(10000 * 0.98 ** 50, 6);
    expect(result.paths[0][50]).toBeGreaterThan(0);
  });
});

describe("simulateEquityCurves — rischio a importo fisso", () => {
  it("tutte perdite: scala lineare fino a zero, poi rovina assorbente", () => {
    const result = simulateEquityCurves({
      ...base,
      winProbability: 0,
      riskMode: "amount",
      riskValue: 1000,
      trades: 15,
      lines: 1,
    })!;
    const path = result.paths[0];
    expect(path[1]).toBe(9000);
    expect(path[10]).toBe(0);
    // Un conto azzerato non continua a operare: resta a zero.
    expect(path[15]).toBe(0);
  });

  it("tutte vincite: nessun compounding, incremento fisso per trade", () => {
    const result = simulateEquityCurves({
      ...base,
      winProbability: 1,
      winLossRatio: 1.5,
      riskMode: "amount",
      riskValue: 200,
      trades: 10,
      lines: 1,
    })!;
    expect(result.paths[0][10]).toBeCloseTo(10000 + 10 * 300, 6);
  });
});

describe("simulateEquityCurves — media e input difensivi", () => {
  it("la media a ogni passo è la media aritmetica dei percorsi", () => {
    const result = simulateEquityCurves({ ...base, trades: 30, lines: 7 })!;
    for (const t of [0, 1, 15, 30]) {
      const expected =
        result.paths.reduce((sum, path) => sum + path[t], 0) / result.paths.length;
      expect(result.mean[t]).toBeCloseTo(expected, 9);
    }
  });

  it("input non simulabili → null, mai un grafico finto", () => {
    expect(simulateEquityCurves({ ...base, startEquity: 0 })).toBeNull();
    expect(simulateEquityCurves({ ...base, startEquity: -5 })).toBeNull();
    expect(simulateEquityCurves({ ...base, winProbability: 1.2 })).toBeNull();
    expect(simulateEquityCurves({ ...base, winLossRatio: 0 })).toBeNull();
    expect(simulateEquityCurves({ ...base, riskValue: 0 })).toBeNull();
    // 100% (o più) dell'equity a trade non è un modello di rischio.
    expect(simulateEquityCurves({ ...base, riskValue: 1 })).toBeNull();
    expect(simulateEquityCurves({ ...base, startEquity: NaN })).toBeNull();
  });

  it("trades e lines vengono bloccati sui limiti difensivi", () => {
    const result = simulateEquityCurves({
      ...base,
      trades: SIM_MAX_TRADES + 500,
      lines: SIM_MAX_LINES + 50,
    })!;
    expect(result.paths).toHaveLength(SIM_MAX_LINES);
    expect(result.paths[0]).toHaveLength(SIM_MAX_TRADES + 1);
  });
});
