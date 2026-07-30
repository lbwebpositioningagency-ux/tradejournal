import { describe, expect, it } from "vitest";
import { buildSim1Dataset } from "@/lib/demo/sim1-dataset";
import { computeTrade } from "@/lib/trade-compute";
import {
  DEFAULT_SEED,
  MAX_SIMS,
  horizonFromMonths,
  monteCarloLab,
  parametricParams,
  tradesPerDay,
  type MonteCarloLabOptions,
} from "./monte-carlo-lab";

/**
 * Golden test della simulazione su SIM1 (200 R storici, deterministici).
 *
 * La proprietà che conta più di ogni valore atteso è la RIPRODUCIBILITÀ:
 * una simulazione i cui numeri cambiano a ogni caricamento non è
 * verificabile da nessuno, e chi la legge non può distinguere un
 * cambiamento nei dati da rumore dell'RNG.
 */

const rValues = buildSim1Dataset()
  .map(
    (t) =>
      computeTrade(t.executions, {
        pointValue: t.pointValue,
        initialRisk: t.initialRisk,
        plannedStop: t.plannedStop,
        plannedTarget: t.plannedTarget,
      }).rMultiple,
  )
  .filter((r): r is string => r !== null);

const base: MonteCarloLabOptions = {
  horizon: 250,
  sims: 5000,
  startingEquity: "50000",
  riskPerTrade: "0.01",
  riskMode: "fixed-fractional",
};

describe("riproducibilità", () => {
  it("stesso seed → risultato identico, percentile per percentile", () => {
    const a = monteCarloLab(rValues, base)!;
    const b = monteCarloLab(rValues, base)!;
    expect(b.finalEquity).toEqual(a.finalEquity);
    expect(b.maxDrawdown).toEqual(a.maxDrawdown);
    expect(b.probProfit).toBe(a.probProfit);
    expect(b.fan).toEqual(a.fan);
  });

  it("seed diverso → percorso diverso (l'RNG conta davvero)", () => {
    const a = monteCarloLab(rValues, base)!;
    const b = monteCarloLab(rValues, { ...base, seed: DEFAULT_SEED + 1 })!;
    expect(b.finalEquity.p50).not.toBe(a.finalEquity.p50);
  });

  it("valori attesi noti col seed di default (SIM1)", () => {
    const r = monteCarloLab(rValues, base)!;
    expect(r.finalEquity.p05).toBeCloseTo(63346.0, 1);
    expect(r.finalEquity.p50).toBeCloseTo(88372.53, 1);
    expect(r.finalEquity.p95).toBeCloseTo(123914.31, 1);
    expect(r.maxDrawdown.median).toBeCloseTo(0.094, 3);
    expect(r.maxDrawdown.p95).toBeCloseTo(0.162, 3);
    expect(r.probProfit).toBeCloseTo(0.9972, 4);
  });
});

describe("gate e input non validi", () => {
  it("sotto il minimo di R storici non simula: null, mai una fascia finta", () => {
    expect(monteCarloLab(rValues.slice(0, 10), base)).toBeNull();
  });

  it("equity o rischio non positivi → null", () => {
    expect(monteCarloLab(rValues, { ...base, startingEquity: "0" })).toBeNull();
    expect(monteCarloLab(rValues, { ...base, riskPerTrade: "0" })).toBeNull();
  });

  it("scarta gli R non numerici senza contarli come zero", () => {
    const sporchi = [...rValues, "", "  ", "non-un-numero"];
    const r = monteCarloLab(sporchi, base)!;
    expect(r.sampleSize).toBe(rValues.length);
  });

  it("le iterazioni sono limitate a un tetto ragionevole", () => {
    const r = monteCarloLab(rValues, { ...base, sims: 999_999, horizon: 10 })!;
    expect(r.sims).toBe(MAX_SIMS);
  });
});

describe("modello di rischio", () => {
  it("fixed-fractional e fixed-amount producono esiti diversi", () => {
    const frazionale = monteCarloLab(rValues, base)!;
    const fisso = monteCarloLab(rValues, {
      ...base,
      riskMode: "fixed-amount",
      riskPerTrade: "500",
    })!;
    expect(fisso.riskMode).toBe("fixed-amount");
    expect(fisso.finalEquity.p50).not.toBeCloseTo(frazionale.finalEquity.p50, 0);
  });

  it("il compounding rende la coda destra più lunga del rischio fisso", () => {
    // Con expectancy positiva, rischiare una quota dell'equity crescente
    // amplifica gli scenari buoni: è il motivo per cui il default è questo,
    // ma anche perché il drawdown va guardato in percentuale.
    const frazionale = monteCarloLab(rValues, base)!;
    const fisso = monteCarloLab(rValues, {
      ...base,
      riskMode: "fixed-amount",
      riskPerTrade: "500",
    })!;
    const ampiezza = (r: typeof frazionale) =>
      r.finalEquity.p95 - r.finalEquity.p50;
    expect(ampiezza(frazionale)).toBeGreaterThan(ampiezza(fisso));
  });

  it("il rischio di rovina è una frazione fra 0 e 1", () => {
    const r = monteCarloLab(rValues, base)!;
    expect(r.riskOfRuin).toBeGreaterThanOrEqual(0);
    expect(r.riskOfRuin).toBeLessThanOrEqual(1);
  });

  it("con R storici tutti negativi la rovina diventa quasi certa", () => {
    const perdenti = rValues.map(() => "-1");
    const r = monteCarloLab(perdenti, { ...base, horizon: 500 })!;
    expect(r.riskOfRuin).toBeGreaterThan(0.9);
    expect(r.probProfit).toBe(0);
  });
});

describe("metodo parametrico", () => {
  it("deriva i parametri dagli stessi R storici", () => {
    const p = parametricParams(rValues.map(Number))!;
    expect(p.winRate).toBeGreaterThan(0.4);
    expect(p.winRate).toBeLessThan(0.6);
    expect(p.avgWinR).toBeGreaterThan(0);
    expect(p.avgLossR).toBeLessThan(0);
  });

  it("senza vincite o senza perdite non è definibile", () => {
    expect(parametricParams([1, 2, 3])).toBeNull();
    expect(parametricParams([-1, -2])).toBeNull();
  });

  it("ricade sul bootstrap invece di inventare una distribuzione", () => {
    const soloVincite = rValues.map(() => "1.5");
    const r = monteCarloLab(soloVincite, { ...base, method: "parametric" })!;
    expect(r.method).toBe("bootstrap");
  });
});

describe("output", () => {
  const r = monteCarloLab(rValues, base)!;

  it("il fan chart è campionato, non un punto per trade", () => {
    expect(r.fan.length).toBeLessThanOrEqual(101);
    expect(r.fan.at(-1)!.trade).toBe(base.horizon);
    // I percentili sono ordinati per costruzione.
    for (const point of r.fan) {
      expect(point.p05).toBeLessThanOrEqual(point.p25);
      expect(point.p25).toBeLessThanOrEqual(point.p50);
      expect(point.p50).toBeLessThanOrEqual(point.p75);
      expect(point.p75).toBeLessThanOrEqual(point.p95);
    }
  });

  it("il ritorno è coerente con l'equity finale", () => {
    expect(r.finalReturn.p50).toBeCloseTo((r.finalEquity.p50 - 50000) / 50000, 6);
  });

  it("l'istogramma copre tutti i path", () => {
    expect(r.histogram.reduce((a, b) => a + b.count, 0)).toBe(r.sims);
  });

  it("le probabilità di drawdown decrescono al crescere della soglia", () => {
    const probs = r.probDrawdownOver.map((d) => d.probability);
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeLessThanOrEqual(probs[i - 1]);
    }
  });
});

describe("orizzonte temporale → numero di trade", () => {
  it("stima la frequenza dallo storico", () => {
    // 200 trade su 400 giorni = 0,5 trade al giorno.
    expect(tradesPerDay(200, 400)).toBeCloseTo(0.5, 6);
  });

  it("con storico troppo corto non stima nulla, invece di indovinare", () => {
    expect(tradesPerDay(20, 10)).toBeNull();
    expect(horizonFromMonths(6, null)).toBeNull();
  });

  it("converte i mesi in trade con la frequenza stimata", () => {
    // 6 mesi × 30,44 giorni × 0,5 trade/giorno ≈ 91 trade.
    expect(horizonFromMonths(6, 0.5)).toBe(91);
  });
});
