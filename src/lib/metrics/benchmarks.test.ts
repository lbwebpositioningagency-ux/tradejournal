import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  benchmarkTier,
  CALMAR_BENCHMARK,
  CALMAR_MIN_DAYS,
  CALMAR_RELIABLE_DAYS,
  sortinoBenchmark,
  SORTINO_ANNUAL_THRESHOLDS,
  SORTINO_SCALE_MIN_ACTIVE_DAYS,
  SORTINO_SCALE_MIN_COVERED_DAYS,
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
 *
 * Sul Sortino c'è in più la derivazione del fattore: le soglie NON sono
 * costanti, si tarano sulle osservazioni annue del conto.
 */

/** Un Sortino "tipico": 42 giorni operativi in 288 di storico. */
const SORTINO_TYPICAL = sortinoBenchmark(42, 288).benchmark;

const ALL: [string, MetricBenchmark][] = [
  ["sortino", SORTINO_TYPICAL],
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
    expect(SORTINO_TYPICAL.bands.map((b) => b.tier)).toEqual([
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

  it("Ulcer: scala invertita, il valore è una frazione 0-1", () => {
    // 4% → OTTIMO, 7% → MEDIO, 12% → SCARSO
    expect(benchmarkTier(ULCER_BENCHMARK, "0.0400")).toBe("OTTIMO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.0500")).toBe("MEDIO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.1000")).toBe("SCARSO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.0000")).toBe("OTTIMO");
  });

  it("la fascia segue il valore ARROTONDATO come nella card", () => {
    // 2,497 si legge "2,5": fascia OTTIMO, coerente col numero mostrato
    expect(benchmarkTier(SQN_BENCHMARK, "2.497")).toBe("OTTIMO");
    // sull'Ulcer l'arrotondamento è a 4 decimali (2 sulla percentuale)
    expect(benchmarkTier(ULCER_BENCHMARK, "0.04999")).toBe("MEDIO");
    expect(benchmarkTier(ULCER_BENCHMARK, "0.049949")).toBe("OTTIMO");
  });
});

describe("sortinoBenchmark: soglie tarate sulle osservazioni reali", () => {
  /** Soglie attese: annuale ÷ √(giorni con trade × 365 / giorni coperti). */
  function expected(activeDays: number, coveredDays: number) {
    const f = new Decimal(activeDays).times(365).div(coveredDays).sqrt();
    return SORTINO_ANNUAL_THRESHOLDS.map((t) =>
      new Decimal(t)
        .div(f)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber(),
    );
  }

  it("divide le soglie annuali per la radice delle osservazioni annue", () => {
    // 120 giorni operativi su un anno pieno → f = √120 ≈ 10,95
    const scale = sortinoBenchmark(120, 365);
    expect(scale.estimated).toBe(true);
    expect(scale.observationsPerYear).toBe(120);
    const [medio, ottimo] = expected(120, 365);
    expect(medio).toBe(0.09); // il caso citato: 0,09, non 0,06
    expect(scale.benchmark.bands[1].min).toBe(medio);
    expect(scale.benchmark.bands[2].min).toBe(ottimo);
  });

  it("un conto più rado ha soglie PIÙ ALTE (√252 sarebbe ottimista)", () => {
    const rado = sortinoBenchmark(60, 365).benchmark.bands[1].min!;
    const fitto = sortinoBenchmark(240, 365).benchmark.bands[1].min!;
    expect(rado).toBeGreaterThan(fitto);
    // e la vecchia costante 0,06 (tarata su 252) sottostimava già a 240 giorni
    expect(fitto).toBeGreaterThanOrEqual(0.06);
  });

  it("OTTIMO è sempre il doppio di MEDIO (soglie annuali 1 e 2)", () => {
    for (const [active, covered] of [
      [42, 288],
      [120, 365],
      [200, 400],
      [20, 90],
    ]) {
      const bands = sortinoBenchmark(active, covered).benchmark.bands;
      const [medio, ottimo] = expected(active, covered);
      expect(bands[1].min).toBe(medio);
      expect(bands[2].min).toBe(ottimo);
      expect(bands[1].min!).toBeLessThan(bands[2].min!);
    }
  });

  it("le osservazioni annue non superano i 365 giorni di calendario", () => {
    // ogni giorno operativo è anche un giorno di calendario: il rapporto è ≤ 1
    expect(sortinoBenchmark(300, 300).observationsPerYear).toBe(365);
  });

  it("campione insufficiente → scala provvisoria, non stimata", () => {
    const pochiGiorni = sortinoBenchmark(
      SORTINO_SCALE_MIN_ACTIVE_DAYS - 1,
      365,
    );
    expect(pochiGiorni.estimated).toBe(false);
    expect(pochiGiorni.observationsPerYear).toBeNull();

    const storicoCorto = sortinoBenchmark(
      50,
      SORTINO_SCALE_MIN_COVERED_DAYS - 1,
    );
    expect(storicoCorto.estimated).toBe(false);

    // al limite esatto la stima è ammessa
    expect(
      sortinoBenchmark(
        SORTINO_SCALE_MIN_ACTIVE_DAYS,
        SORTINO_SCALE_MIN_COVERED_DAYS,
      ).estimated,
    ).toBe(true);
  });

  it("il ripiego dichiara i 252 e non finge una taratura", () => {
    const scale = sortinoBenchmark(3, 10);
    expect(scale.benchmark.bands[1].min).toBe(0.06); // 1/√252
    expect(scale.benchmark.calibration).toContain("252");
    expect(scale.benchmark.calibration).toContain("provvisoria");
  });

  it("dichiara sempre il fattore e su cosa è stimato", () => {
    const scale = sortinoBenchmark(42, 288);
    expect(scale.benchmark.calibration).toContain("giorni operativi/anno");
    expect(scale.benchmark.calibration).toContain("42");
    expect(scale.benchmark.calibration).toContain("288");
  });

  it("le fasce derivate restano contigue e classificano sugli estremi", () => {
    const benchmark = sortinoBenchmark(77, 200).benchmark;
    expect(benchmark.bands[0].max).toBe(benchmark.bands[1].min);
    expect(benchmark.bands[1].max).toBe(benchmark.bands[2].min);
    const medio = benchmark.bands[1].min!;
    expect(benchmarkTier(benchmark, String(medio))).toBe("MEDIO");
    expect(benchmarkTier(benchmark, String(medio - 0.01))).toBe("SCARSO");
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
