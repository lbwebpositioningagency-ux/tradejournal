import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  benchmarkTier,
  CALMAR_BENCHMARK,
  CALMAR_MIN_DAYS,
  CALMAR_RELIABLE_DAYS,
  SORTINO_ANNUALIZATION,
  SORTINO_ANNUAL_THRESHOLDS,
  SORTINO_BENCHMARK,
  SQN_BENCHMARK,
  SQN_MIN_TRADES,
  ULCER_BENCHMARK,
  type MetricBenchmark,
} from "./index";

/**
 * Le scale di interpretazione sono dati, non formule: i test verificano che
 * restino BEN FORMATE (bande contigue, che coprono tutta la retta, senza
 * sovrapposizioni) e che la risoluzione della fascia sia corretta sugli
 * estremi — dove un < al posto di un ≤ sposterebbe l'etichetta.
 */

const ALL: [string, MetricBenchmark][] = [
  ["sortino", SORTINO_BENCHMARK],
  ["calmar", CALMAR_BENCHMARK],
  ["sqn", SQN_BENCHMARK],
  ["ulcer", ULCER_BENCHMARK],
];

describe("benchmark: forma delle scale", () => {
  it.each(ALL)("%s ha 3 fasce con le etichette attese", (_name, benchmark) => {
    expect(benchmark.bands).toHaveLength(3);
    expect(benchmark.decimals).toBeGreaterThan(0);
    expect(new Set(benchmark.bands.map((b) => b.tier))).toEqual(
      new Set(["SCARSO", "MEDIO", "OTTIMO"]),
    );
  });

  it.each(ALL)("%s è contigua e copre tutta la retta", (_name, benchmark) => {
    const bands = benchmark.bands;
    expect(bands[0].min).toBeNull();
    expect(bands[bands.length - 1].max).toBeNull();
    for (let i = 0; i < bands.length - 1; i++) {
      // il limite superiore di una banda è il limite inferiore della seguente:
      // nessun buco, nessuna sovrapposizione
      expect(bands[i].max).toBe(bands[i + 1].min);
    }
  });

  it("ordina dalla peggiore alla migliore, invertendo solo Ulcer", () => {
    expect(SORTINO_BENCHMARK.bands.map((b) => b.tier)).toEqual([
      "SCARSO",
      "MEDIO",
      "OTTIMO",
    ]);
    expect(ULCER_BENCHMARK.lowerIsBetter).toBe(true);
    expect(ULCER_BENCHMARK.bands.map((b) => b.tier)).toEqual([
      "OTTIMO",
      "MEDIO",
      "SCARSO",
    ]);
  });
});

describe("benchmarkTier", () => {
  it("valore mancante o non numerico → nessuna fascia", () => {
    expect(benchmarkTier(SQN_BENCHMARK, null)).toBeNull();
    expect(benchmarkTier(SQN_BENCHMARK, "n/d")).toBeNull();
    expect(benchmarkTier(SQN_BENCHMARK, "Infinity")).toBeNull();
  });

  it("SQN: soglie di Van Tharp, estremo inferiore incluso", () => {
    expect(benchmarkTier(SQN_BENCHMARK, "1.59")).toBe("SCARSO");
    expect(benchmarkTier(SQN_BENCHMARK, "1.60")).toBe("MEDIO");
    expect(benchmarkTier(SQN_BENCHMARK, "2.49")).toBe("MEDIO");
    expect(benchmarkTier(SQN_BENCHMARK, "2.50")).toBe("OTTIMO");
    expect(benchmarkTier(SQN_BENCHMARK, "-3")).toBe("SCARSO");
  });

  it("Calmar: 1 e 3 sono i confini", () => {
    expect(benchmarkTier(CALMAR_BENCHMARK, "0.99")).toBe("SCARSO");
    expect(benchmarkTier(CALMAR_BENCHMARK, "1")).toBe("MEDIO");
    expect(benchmarkTier(CALMAR_BENCHMARK, "3")).toBe("OTTIMO");
  });

  it("Sortino: soglie sulla scala GIORNALIERA calcolata dall'app", () => {
    expect(benchmarkTier(SORTINO_BENCHMARK, "0.0549")).toBe("SCARSO");
    expect(benchmarkTier(SORTINO_BENCHMARK, "0.06")).toBe("MEDIO");
    expect(benchmarkTier(SORTINO_BENCHMARK, "0.13")).toBe("OTTIMO");
  });

  it("la fascia segue il valore ARROTONDATO come nella card", () => {
    // 0,0551 si legge "0,06" a schermo: la scala non può dire "< 0,06"
    expect(benchmarkTier(SORTINO_BENCHMARK, "0.0551")).toBe("MEDIO");
    // 2,497 si legge "2,5": fascia OTTIMO, coerente col numero mostrato
    expect(benchmarkTier(SQN_BENCHMARK, "2.497")).toBe("OTTIMO");
    // sull'Ulcer l'arrotondamento è a 4 decimali (2 sulla percentuale)
    expect(benchmarkTier(ULCER_BENCHMARK, "0.04999")).toBe("MEDIO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.049949")).toBe("OTTIMO");
  });

  it("Ulcer: scala invertita, il valore è una frazione 0-1", () => {
    // 4% → OTTIMO, 7% → MEDIO, 12% → SCARSO
    expect(benchmarkTier(ULCER_BENCHMARK, "0.0400")).toBe("OTTIMO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.0500")).toBe("MEDIO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.1000")).toBe("SCARSO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.0000")).toBe("OTTIMO");
  });
});

describe("derivazione delle soglie Sortino", () => {
  it("le soglie giornaliere sono quelle annuali ÷ √252 (arrotondate a 2 dec.)", () => {
    const cuts = SORTINO_BENCHMARK.bands
      .map((b) => b.min)
      .filter((min): min is number => min !== null);
    expect(cuts).toHaveLength(SORTINO_ANNUAL_THRESHOLDS.length);
    cuts.forEach((cut, i) => {
      const expected = new Decimal(SORTINO_ANNUAL_THRESHOLDS[i])
        .div(SORTINO_ANNUALIZATION)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
      expect(cut).toBe(expected);
    });
  });
});

describe("soglie di campione", () => {
  it("il gate di affidabilità del Calmar è più severo di quello di calcolo", () => {
    expect(CALMAR_RELIABLE_DAYS).toBeGreaterThan(CALMAR_MIN_DAYS);
    expect(CALMAR_RELIABLE_DAYS).toBe(365);
  });

  it("l'SQN riusa la soglia dei 30 trade già in app", () => {
    expect(SQN_MIN_TRADES).toBe(30);
  });
});
