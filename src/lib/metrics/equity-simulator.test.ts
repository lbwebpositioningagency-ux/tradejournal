import { describe, expect, it } from "vitest";
import {
  SIM_MAX_LINES,
  SIM_MAX_TRADES,
  equityAggregatesFromPaths,
  equityBandsFromPaths,
  equityStatsFromPaths,
  pathMaxDrawdown,
  pathStreaks,
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

describe("pathMaxDrawdown — Fase 34b", () => {
  it("drawdown dal picco, non dall'inizio", () => {
    // Picco 120, minimo successivo 60: DD = (120−60)/120 = 0,5. Il calo
    // iniziale 100→90 (10%) non è il massimo.
    expect(pathMaxDrawdown([100, 90, 120, 60, 90])).toBeCloseTo(0.5, 12);
  });

  it("serie solo crescente → drawdown zero", () => {
    expect(pathMaxDrawdown([100, 110, 125])).toBe(0);
  });

  it("equity azzerata → drawdown 1", () => {
    expect(pathMaxDrawdown([100, 50, 0, 0])).toBe(1);
  });
});

describe("equityStatsFromPaths — Fase 34b", () => {
  // 4 percorsi costruiti a mano da start 100: finali 150, 120, 90, 40.
  const paths = [
    [100, 120, 150], // mai in drawdown
    [100, 130, 120], // DD (130−120)/130
    [100, 80, 90], // DD 0,2 · finale sotto lo start
    [100, 60, 40], // DD 0,6 · tocca 40 ≤ 50 → rovina (soglia 50%)
  ];

  it("probProfit conta i finali sopra lo start", () => {
    const stats = equityStatsFromPaths(paths, 100)!;
    expect(stats.probProfit).toBe(0.5); // 150 e 120 su 4
    expect(stats.lines).toBe(4);
  });

  it("percentili di equity finale e ritorno coerenti fra loro", () => {
    const stats = equityStatsFromPaths(paths, 100)!;
    expect(stats.finalEquity.p05).toBe(40);
    expect(stats.finalEquity.p95).toBe(150);
    expect(stats.finalReturn.p05).toBeCloseTo(-0.6, 12);
    expect(stats.finalReturn.p95).toBeCloseTo(0.5, 12);
  });

  it("riskOfRuin: conta i percorsi che TOCCANO la soglia, non solo i finali", () => {
    const stats = equityStatsFromPaths(paths, 100)!;
    expect(stats.riskOfRuin).toBe(0.25); // solo l'ultimo scende a ≤50
    // Percorso che tocca 50 e recupera: è comunque rovina.
    const recovered = equityStatsFromPaths([[100, 50, 200]], 100)!;
    expect(recovered.riskOfRuin).toBe(1);
  });

  it("maxDrawdown mediano sui 4 percorsi", () => {
    const stats = equityStatsFromPaths(paths, 100)!;
    // DD ordinati: 0, 0,0769…, 0,2, 0,6 → mediana (round su indice 1,5 → 2) = 0,2.
    expect(stats.maxDrawdown.p50).toBeCloseTo(0.2, 12);
  });

  it("input degeneri → null, mai statistiche finte", () => {
    expect(equityStatsFromPaths([], 100)).toBeNull();
    expect(equityStatsFromPaths(paths, 0)).toBeNull();
  });
});

describe("pathStreaks — Fase 37", () => {
  it("serie di salite e discese consecutive, dai passi dell'equity", () => {
    // +,+,-,-,-,+ → 2 vincite di fila al massimo, 3 perdite di fila.
    expect(pathStreaks([100, 110, 120, 115, 110, 105, 115])).toEqual({
      maxWins: 2,
      maxLosses: 3,
    });
  });

  it("i passi piatti dopo la rovina non contano come perdite", () => {
    // -,-,0,0: il conto è azzerato e non opera più. La serie di perdite è
    // 2, non 4: contare i passi piatti inventerebbe trade mai avvenuti.
    expect(pathStreaks([100, 50, 0, 0, 0])).toEqual({ maxWins: 0, maxLosses: 2 });
  });

  it("percorso senza passi → nessuna serie", () => {
    expect(pathStreaks([100])).toEqual({ maxWins: 0, maxLosses: 0 });
  });
});

describe("equityAggregatesFromPaths — Fase 37", () => {
  // Tre linee scelte perché ogni aggregato è calcolabile a mano, da 100:
  //  A [100,120,150]     DD 0      · final 150 (+50%) · W2 L0
  //  B [100, 80, 90]     DD 0,2    · final  90 (−10%) · W1 L1
  //  C [100, 90, 80, 70] DD 0,3    · final  70 (−30%) · W0 L3
  const paths = [
    [100, 120, 150],
    [100, 80, 90],
    [100, 90, 80, 70],
  ];

  it("equity: massimo assoluto e media delle finali", () => {
    const agg = equityAggregatesFromPaths(paths, 100)!;
    expect(agg.maxEquity).toBe(150);
    expect(agg.meanEquity).toBeCloseTo(310 / 3, 12); // 103,33
    expect(agg.lines).toBe(3);
  });

  it("rischio: drawdown medio, peggiore e rapporto tipo Calmar", () => {
    const agg = equityAggregatesFromPaths(paths, 100)!;
    expect(agg.avgMaxDrawdown).toBeCloseTo(0.5 / 3, 12); // (0 + 0,2 + 0,3)/3
    expect(agg.biggestMaxDrawdown).toBeCloseTo(0.3, 12);
    expect(agg.avgPerformance).toBeCloseTo(0.1 / 3, 12); // (0,5 − 0,1 − 0,3)/3
    // (0,1/3) / (0,5/3) = 0,2 esatto.
    expect(agg.returnOnMaxDrawdown).toBeCloseTo(0.2, 12);
  });

  it("streak: la più lunga osservata su una linea qualunque", () => {
    const agg = equityAggregatesFromPaths(paths, 100)!;
    expect(agg.maxConsecutiveWins).toBe(2); // dalla linea A
    expect(agg.maxConsecutiveLosses).toBe(3); // dalla linea C
  });

  it("drawdown medio zero → rapporto non definito, mai un numero finto", () => {
    const agg = equityAggregatesFromPaths([[100, 110, 120]], 100)!;
    expect(agg.avgMaxDrawdown).toBe(0);
    expect(agg.returnOnMaxDrawdown).toBeNull();
  });

  it("performance media negativa → rapporto negativo, non nascosto", () => {
    const agg = equityAggregatesFromPaths([[100, 120, 60]], 100)!;
    expect(agg.avgPerformance).toBeCloseTo(-0.4, 12);
    expect(agg.avgMaxDrawdown).toBeCloseTo(0.5, 12); // da 120 a 60
    expect(agg.returnOnMaxDrawdown).toBeCloseTo(-0.8, 12);
  });

  it("input degeneri → null", () => {
    expect(equityAggregatesFromPaths([], 100)).toBeNull();
    expect(equityAggregatesFromPaths(paths, 0)).toBeNull();
  });

  it("sugli stessi percorsi del grafico: aggregati coerenti coi percentili", () => {
    const result = simulateEquityCurves(base)!;
    const agg = equityAggregatesFromPaths(result.paths, base.startEquity)!;
    const stats = equityStatsFromPaths(result.paths, base.startEquity)!;
    expect(agg.lines).toBe(stats.lines);
    // Il massimo assoluto non può stare sotto il 95° percentile, e il
    // drawdown peggiore non può stare sotto quello medio.
    expect(agg.maxEquity).toBeGreaterThanOrEqual(stats.finalEquity.p95);
    expect(agg.biggestMaxDrawdown).toBeGreaterThanOrEqual(agg.avgMaxDrawdown);
    expect(agg.maxConsecutiveWins).toBeGreaterThan(0);
  });
});

describe("equityBandsFromPaths — Fase 34b", () => {
  it("media ± 1σ e ± 2σ di popolazione, per passo", () => {
    // Al passo 1: valori 10 e 20 → media 15, σ = 5.
    const bands = equityBandsFromPaths([
      [100, 10],
      [100, 20],
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0]).toEqual({ mean: 100, sd: 0, inner: [100, 100], outer: [100, 100] });
    expect(bands[1].mean).toBe(15);
    expect(bands[1].sd).toBe(5);
    expect(bands[1].inner).toEqual([10, 20]);
    expect(bands[1].outer).toEqual([5, 25]);
  });

  it("la banda non scende mai sotto zero (l'equity non può)", () => {
    const bands = equityBandsFromPaths([
      [100, 1],
      [100, 41],
    ]);
    // media 21, σ 20: inner [1, 41], outer [max(0, −19), 61].
    expect(bands[1].outer).toEqual([0, 61]);
  });

  it("un solo percorso → σ 0, bande collassate sulla media", () => {
    const bands = equityBandsFromPaths([[100, 110]]);
    expect(bands[1]).toEqual({ mean: 110, sd: 0, inner: [110, 110], outer: [110, 110] });
  });

  it("nessun percorso → nessuna banda", () => {
    expect(equityBandsFromPaths([])).toEqual([]);
  });

  it("le bande derivano dagli STESSI percorsi della simulazione", () => {
    const result = simulateEquityCurves(base)!;
    const bands = equityBandsFromPaths(result.paths);
    expect(bands).toHaveLength(base.trades + 1);
    for (const t of [0, 50, 100]) {
      expect(bands[t].mean).toBeCloseTo(result.mean[t], 9);
    }
  });
});
