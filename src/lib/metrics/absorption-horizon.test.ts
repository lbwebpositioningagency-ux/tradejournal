import { describe, expect, it } from "vitest";
import {
  ABSORPTION_MAX_HORIZON,
  AbsorptionError,
  absorptionAt,
  binaryDistribution,
  buildAbsorptionChain,
  computeAbsorptionCurve,
  computeAbsorptionHorizon,
  defaultHorizon,
  expectedTradesAt,
  expectedTradesFromChain,
  type AbsorptionChain,
} from "./absorption";

/** La distribuzione da cui la catena è stata costruita, per rifare la curva. */
function distributionOf(chain: AbsorptionChain) {
  return [...chain.jumps].map(([nodes, probability]) => ({
    value: nodes * chain.gridStep,
    probability,
  }));
}

describe("expectedTradesFromChain — numero atteso di trade", () => {
  it("random walk simmetrico: E[durata] = i·(N−i) in unità di passo", () => {
    // Risultato classico del gambler's ruin equo con salti ±1: partendo a i
    // unità dalla barriera bassa su N totali, la durata attesa è i·(N−i).
    // Verifica a mano, e blinda il fatto che il sistema risolto qui sia
    // davvero (I − Q)·t = 1 e non qualcos'altro.
    const chain = buildAbsorptionChain({
      distribution: [
        { value: 1, probability: 0.5 },
        { value: -1, probability: 0.5 },
      ],
      target: 10,
      drawdown: 10,
      gridStep: 1,
    });
    const expected = expectedTradesFromChain(chain);
    for (let i = 1; i < 20; i++) {
      expect(expectedTradesAt(chain, expected, -10 + i)).toBeCloseTo(
        i * (20 - i),
        8,
      );
    }
  });

  it("sulle barriere il tentativo è già chiuso: zero trade attesi", () => {
    const chain = buildAbsorptionChain({
      distribution: binaryDistribution({
        winRate: 0.5,
        rewardRisk: 2,
        riskPerTrade: 0.5,
      }),
      target: 10,
      drawdown: 10,
    });
    const expected = expectedTradesFromChain(chain);
    expect(expectedTradesAt(chain, expected, 10)).toBe(0);
    expect(expectedTradesAt(chain, expected, -10)).toBe(0);
    expect(expectedTradesAt(chain, expected, 0)).toBeGreaterThan(0);
  });
});

describe("defaultHorizon", () => {
  it("raddoppia l'attesa e arrotonda in su a una taglia leggibile", () => {
    expect(defaultHorizon(12)).toBe(50); // 24 → multipli di 50
    expect(defaultHorizon(40)).toBe(100); // 80 → multipli di 50
    expect(defaultHorizon(130)).toBe(300); // 260 → multipli di 100
    expect(defaultHorizon(700)).toBe(1400); // 1400 → multipli di 200
  });

  it("non supera mai il tetto difensivo", () => {
    expect(defaultHorizon(1e9)).toBe(ABSORPTION_MAX_HORIZON);
  });
});

describe("computeAbsorptionHorizon — propagazione v_n = v_(n−1)·P", () => {
  const strongEdge = buildAbsorptionChain({
    distribution: binaryDistribution({
      winRate: 0.65,
      rewardRisk: 2.5,
      riskPerTrade: 1,
    }),
    target: 10,
    drawdown: 10,
  });
  const weakEdge = buildAbsorptionChain({
    distribution: binaryDistribution({
      winRate: 0.35,
      rewardRisk: 1.2,
      riskPerTrade: 1,
    }),
    target: 10,
    drawdown: 10,
  });

  it("a n = 0 tutta la massa sta sullo stato di partenza", () => {
    const { steps } = computeAbsorptionHorizon(strongEdge, {
      startLevel: 0,
      maxTrades: 50,
    });
    const first = steps[0];
    expect(first.trade).toBe(0);
    expect(first.pass).toBe(0);
    expect(first.fail).toBe(0);
    expect(first.running).toBeCloseTo(1, 12);
    // Distribuzione degenere: ogni percentile cade sul punto di partenza.
    expect(first.p10).toBeCloseTo(0, 12);
    expect(first.p50).toBeCloseTo(0, 12);
    expect(first.p90).toBeCloseTo(0, 12);
  });

  it("partendo da un livello diverso da 0 la massa iniziale sta lì", () => {
    const { steps, startLevel } = computeAbsorptionHorizon(strongEdge, {
      startLevel: 3,
      maxTrades: 20,
    });
    expect(startLevel).toBeCloseTo(3, 12);
    expect(steps[0].p50).toBeCloseTo(3, 12);
    expect(steps[0].running).toBeCloseTo(1, 12);
  });

  it("la probabilità si conserva a OGNI passo, non solo alla fine", () => {
    for (const chain of [strongEdge, weakEdge]) {
      const { steps } = computeAbsorptionHorizon(chain, {
        startLevel: 0,
        maxTrades: 400,
        maxPoints: 401, // nessun campionamento: si controllano tutti i passi
      });
      expect(steps.length).toBe(401);
      for (const step of steps) {
        expect(step.pass + step.fail + step.running).toBeCloseTo(1, 10);
      }
    }
  });

  it("con n grande, pass + fail converge alla curva a orizzonte illimitato", () => {
    for (const chain of [strongEdge, weakEdge]) {
      const curve = computeAbsorptionCurve({
        distribution: distributionOf(chain),
        target: chain.target,
        drawdown: chain.drawdown,
        gridStep: chain.gridStep,
      });
      const limit = absorptionAt(curve, 0) ?? 0;
      const { steps } = computeAbsorptionHorizon(chain, {
        startLevel: 0,
        maxTrades: 3000,
        maxPoints: 2,
      });
      const last = steps[steps.length - 1];
      // Tutto risolto...
      expect(last.pass + last.fail).toBeGreaterThan(0.999);
      // ...e la quota di Pass coincide col limite asintotico già validato,
      // entro 0,1 punti percentuali.
      expect(Math.abs(last.pass - limit)).toBeLessThan(0.001);
    }
  });

  it("edge forte: pochi trade non producono un crollo prematuro", () => {
    const { steps } = computeAbsorptionHorizon(strongEdge, {
      startLevel: 0,
      maxTrades: 10,
      maxPoints: 11,
    });
    // Con +2,5%/−1% e 65% di win rate servono dieci perdite di fila per
    // sfondare: a 10 trade la massa fallita è una briciola.
    expect(steps[10].fail).toBeLessThan(0.02);
    expect(steps[10].fail).toBeLessThan(steps[10].pass);
  });

  it("edge debole: la massa fallita cresce più in fretta di quella passata", () => {
    const { steps } = computeAbsorptionHorizon(weakEdge, {
      startLevel: 0,
      maxTrades: 40,
      maxPoints: 41,
    });
    for (const n of [20, 30, 40]) {
      expect(steps[n].fail).toBeGreaterThan(steps[n].pass);
    }
    // e la mediana è già scivolata sotto lo zero
    expect(steps[40].p50).toBeLessThan(0);
  });

  it("i percentili sono ordinati e stanno dentro le barriere", () => {
    const { steps } = computeAbsorptionHorizon(weakEdge, {
      startLevel: 0,
      maxTrades: 200,
    });
    for (const s of steps) {
      expect(s.p10).toBeLessThanOrEqual(s.p25 + 1e-12);
      expect(s.p25).toBeLessThanOrEqual(s.p50 + 1e-12);
      expect(s.p50).toBeLessThanOrEqual(s.p75 + 1e-12);
      expect(s.p75).toBeLessThanOrEqual(s.p90 + 1e-12);
      expect(s.p10).toBeGreaterThanOrEqual(-10);
      expect(s.p90).toBeLessThanOrEqual(10);
    }
  });

  it("la copertura della banda è MISURATA, non l'80% nominale", () => {
    const { steps } = computeAbsorptionHorizon(weakEdge, {
      startLevel: 0,
      maxTrades: 300,
    });
    for (const s of steps) {
      // Una banda fra due percentili contiene ALMENO la quota nominale, e con
      // gli atomi sulle barriere spesso molto di più: è il motivo per cui il
      // numero va misurato e scritto in legenda invece di assumerlo.
      expect(s.coverageOuter).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(s.coverageInner).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(s.coverageOuter).toBeLessThanOrEqual(1 + 1e-9);
      expect(s.coverageInner).toBeLessThanOrEqual(s.coverageOuter + 1e-9);
    }
    // E soprattutto: a orizzonte lungo la banda NON si allarga, COLLASSA.
    // Con questo edge il 97% dei tentativi è già finito contro il muro basso,
    // quindi sia il 10° sia il 90° percentile stanno su −drawdown e la banda
    // è un punto solo che copre il 98% dei casi. Una lettura gaussiana qui
    // sarebbe grottesca, ed è la ragione per cui la copertura si misura.
    const last = steps[steps.length - 1];
    expect(last.fail).toBeGreaterThan(0.9);
    expect(last.p10).toBeCloseTo(-10, 9);
    expect(last.p90).toBeCloseTo(-10, 9);
    expect(last.coverageOuter).toBeCloseTo(last.fail, 9);
  });

  it("il campionamento dei punti tiene primo e ultimo passo", () => {
    const { steps } = computeAbsorptionHorizon(strongEdge, {
      startLevel: 0,
      maxTrades: 1000,
      maxPoints: 50,
    });
    expect(steps.length).toBeLessThanOrEqual(50);
    expect(steps[0].trade).toBe(0);
    expect(steps[steps.length - 1].trade).toBe(1000);
  });

  it("orizzonte non valido o troppo lungo → errore esplicito", () => {
    expect(() =>
      computeAbsorptionHorizon(strongEdge, { startLevel: 0, maxTrades: 0 }),
    ).toThrow(AbsorptionError);
    expect(() =>
      computeAbsorptionHorizon(strongEdge, { startLevel: 0, maxTrades: 7.5 }),
    ).toThrow(AbsorptionError);
    expect(() =>
      computeAbsorptionHorizon(strongEdge, {
        startLevel: 0,
        maxTrades: ABSORPTION_MAX_HORIZON + 1,
      }),
    ).toThrow(/troppo lungo/);
  });

  it("partendo da una barriera il tentativo nasce già chiuso e resta congelato", () => {
    const passed = computeAbsorptionHorizon(strongEdge, {
      startLevel: 10,
      maxTrades: 5,
    });
    expect(passed.steps[0].pass).toBe(1);
    expect(passed.steps[passed.steps.length - 1].pass).toBe(1);
    const failed = computeAbsorptionHorizon(strongEdge, {
      startLevel: -10,
      maxTrades: 5,
    });
    expect(failed.steps[0].fail).toBe(1);
    expect(failed.steps[failed.steps.length - 1].fail).toBe(1);
  });
});
