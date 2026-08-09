import { describe, expect, it } from "vitest";
import {
  SIM_CROSS_CHECK_TOLERANCE,
  SIM_DEFAULT_PATHS,
  SIM_SEED,
  ChallengeSimError,
  blocksAvailable,
  crossCheckPassRate,
  runChallengeSimulation,
  type ChallengeSimInput,
} from "./challenge-sim";
import {
  ABSORPTION_GRID_STEP,
  absorptionAt,
  binaryDistribution,
  computeAbsorptionCurve,
  empiricalDistribution,
} from "./absorption";

const BASE: Omit<ChallengeSimInput, "mode"> = {
  sequence: [],
  binary: { winRate: 0.45, rewardRisk: 1.8, riskPerTrade: 1 },
  blockLength: 20,
  target: 10,
  drawdown: 10,
  startLevel: 0,
  paths: SIM_DEFAULT_PATHS,
  maxTrades: 3000,
  gridStep: ABSORPTION_GRID_STEP,
  seed: SIM_SEED,
};

/** Trade per ciclo nei due storici sintetici (8 perdite + 8 vincite). */
const CLUSTER = 8;

/**
 * Storico sintetico con AUTOCORRELAZIONE forte: perdite a grappoli di otto,
 * poi vincite a grappoli di otto. Un i.i.d. non la vede, un block bootstrap
 * con blocchi lunghi sì — è il caso in cui le due modalità DEVONO divergere.
 */
function clusteredSequence(cycles: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < CLUSTER; i++) out.push(-1);
    for (let i = 0; i < CLUSTER; i++) out.push(1.3);
  }
  return out;
}

/** Storico "mescolato": stessi valori e stesse frequenze, ordine alternato. */
function shuffledSameValues(cycles: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < CLUSTER; i++) {
      out.push(-1);
      out.push(1.3);
    }
  }
  return out;
}

describe("runChallengeSimulation — conservazione e determinismo", () => {
  it("pass / fail / non risolto sono esclusivi e sommano a 1", () => {
    for (const mode of ["parametric", "empirical", "block"] as const) {
      const result = runChallengeSimulation({
        ...BASE,
        mode,
        sequence: clusteredSequence(30),
        paths: 5000,
      });
      expect(result.pass + result.fail + result.unresolved).toBeCloseTo(1, 12);
      for (const value of [result.pass, result.fail, result.unresolved]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      // Le frequenze vengono da conteggi interi su `paths`: nessuna
      // approssimazione possibile nella partizione.
      expect(Math.round(result.pass * result.paths)).toBe(
        result.paths -
          Math.round(result.fail * result.paths) -
          Math.round(result.unresolved * result.paths),
      );
    }
  });

  it("stesso seed, stesso risultato (il pannello promette riproducibilità)", () => {
    const run = () =>
      runChallengeSimulation({ ...BASE, mode: "parametric", paths: 3000 });
    expect(run()).toEqual(run());
  });

  it("le probabilità di streak sono monotone decrescenti nella lunghezza", () => {
    const { lossStreak } = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      paths: 5000,
    });
    for (let i = 1; i < lossStreak.length; i++) {
      expect(lossStreak[i].probability).toBeLessThanOrEqual(
        lossStreak[i - 1].probability,
      );
    }
  });

  it("le soglie di drawdown sono più difficili man mano che si scende", () => {
    const { drawdownRisk } = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      paths: 5000,
    });
    expect(drawdownRisk.map((d) => d.threshold)).toEqual([-5, -7, -8, -9]);
    for (let i = 1; i < drawdownRisk.length; i++) {
      expect(drawdownRisk[i].probability).toBeLessThanOrEqual(
        drawdownRisk[i - 1].probability,
      );
    }
  });
});

describe("runChallengeSimulation — cross-check con la matrice esatta", () => {
  /** Probabilità esatta di passaggio da 0, dalla catena di Markov. */
  function exactPass(
    distribution: { value: number; probability: number }[],
  ): number {
    const curve = computeAbsorptionCurve({
      distribution,
      target: 10,
      drawdown: 10,
      gridStep: ABSORPTION_GRID_STEP,
    });
    return absorptionAt(curve, 0) ?? 0;
  }

  it("parametrica: simulato ed esatto entro mezzo punto percentuale", () => {
    const binary = { winRate: 0.45, rewardRisk: 1.8, riskPerTrade: 1 };
    const exact = exactPass(binaryDistribution(binary));
    const sim = runChallengeSimulation({ ...BASE, mode: "parametric", binary });
    expect(sim.unresolved).toBeLessThan(0.001);
    expect(
      Math.abs((sim.passAmongResolved ?? 0) - exact),
    ).toBeLessThan(SIM_CROSS_CHECK_TOLERANCE);
  });

  it("empirica: simulato ed esatto entro mezzo punto percentuale", () => {
    // Stessa sorgente per le due strade: l'istogramma della sequenza.
    const sequence = clusteredSequence(40);
    const counts = new Map<number, number>();
    for (const value of sequence) {
      const bin = Math.round(value / ABSORPTION_GRID_STEP);
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
    }
    const empirical = empiricalDistribution(
      [...counts].map(([bin, count]) => ({ bin, count })),
      ABSORPTION_GRID_STEP,
    )!;
    const exact = exactPass(empirical.distribution);
    const sim = runChallengeSimulation({ ...BASE, mode: "empirical", sequence });
    expect(sim.unresolved).toBeLessThan(0.001);
    expect(
      Math.abs((sim.passAmongResolved ?? 0) - exact),
    ).toBeLessThan(SIM_CROSS_CHECK_TOLERANCE);
  });

  it("crossCheckPassRate avvisa solo quando lo scarto supera la tolleranza", () => {
    const messages: string[] = [];
    const warn = (m: string) => messages.push(m);
    crossCheckPassRate({
      mode: "empirical",
      simulated: 0.5,
      exact: 0.502,
      warn,
    });
    expect(messages).toHaveLength(0);
    crossCheckPassRate({ mode: "empirical", simulated: 0.5, exact: 0.53, warn });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("non concordano");
  });

  it("il block bootstrap è escluso dal cross-check (lì divergere è il risultato)", () => {
    const messages: string[] = [];
    const gap = crossCheckPassRate({
      mode: "block",
      simulated: 0.2,
      exact: 0.9,
      warn: (m) => messages.push(m),
    });
    expect(gap).toBeNull();
    expect(messages).toHaveLength(0);
  });
});

describe("block bootstrap", () => {
  it("con blocco = 1 degenera nell'empirica i.i.d.", () => {
    const sequence = clusteredSequence(40);
    const iid = runChallengeSimulation({ ...BASE, mode: "empirical", sequence });
    const block = runChallengeSimulation({
      ...BASE,
      mode: "block",
      sequence,
      blockLength: 1,
    });
    // Stesso modello, RNG consumato diversamente: resta lo scarto campionario
    // di 20.000 percorsi, non uno scarto sistematico.
    expect(Math.abs(block.pass - iid.pass)).toBeLessThan(0.01);
    expect(
      Math.abs(block.lossStreak[0].probability - iid.lossStreak[0].probability),
    ).toBeLessThan(0.02);
  });

  it("con blocchi lunghi i grappoli sopravvivono e il risultato cambia", () => {
    // Due storici con gli STESSI valori e le stesse frequenze: uno a grappoli
    // di cinque, uno alternato. Per l'i.i.d. sono identici; per il block
    // bootstrap no, ed è tutto il punto della modalità.
    const clustered = clusteredSequence(40);
    const shuffled = shuffledSameValues(40);
    const iidA = runChallengeSimulation({
      ...BASE,
      mode: "empirical",
      sequence: clustered,
    });
    const iidB = runChallengeSimulation({
      ...BASE,
      mode: "empirical",
      sequence: shuffled,
    });
    expect(Math.abs(iidA.pass - iidB.pass)).toBeLessThan(0.01);

    const blockA = runChallengeSimulation({
      ...BASE,
      mode: "block",
      sequence: clustered,
      blockLength: 20,
    });
    const blockB = runChallengeSimulation({
      ...BASE,
      mode: "block",
      sequence: shuffled,
      blockLength: 20,
    });
    // I grappoli producono streak di perdite molto più lunghe...
    expect(blockA.lossStreak[0].probability).toBeGreaterThan(
      blockB.lossStreak[0].probability + 0.2,
    );
    // ...un rischio di drawdown intermedio sensibilmente più alto...
    expect(blockA.drawdownRisk[0].probability).toBeGreaterThan(
      blockB.drawdownRisk[0].probability + 0.05,
    );
    // ...e soprattutto una risposta diversa da quella che l'i.i.d. dà sugli
    // STESSI dati: è la dipendenza temporale che l'i.i.d. non può vedere.
    expect(
      Math.abs(blockA.lossStreak[0].probability - iidA.lossStreak[0].probability),
    ).toBeGreaterThan(0.2);
  });

  it("conta i blocchi non sovrapposti disponibili", () => {
    expect(blocksAvailable(200, 20)).toBe(10);
    expect(blocksAvailable(199, 20)).toBe(9);
    expect(blocksAvailable(5, 20)).toBe(0);
    const result = runChallengeSimulation({
      ...BASE,
      mode: "block",
      sequence: clusteredSequence(10), // 10 cicli x 16 = 160 trade
      blockLength: 20,
      paths: 2000,
    });
    expect(result.blocksAvailable).toBe(8);
  });

  it("lunghezza blocco non valida → errore esplicito", () => {
    const sequence = clusteredSequence(10);
    expect(() =>
      runChallengeSimulation({ ...BASE, mode: "block", sequence, blockLength: 0 }),
    ).toThrow(ChallengeSimError);
    expect(() =>
      runChallengeSimulation({ ...BASE, mode: "block", sequence, blockLength: 7.5 }),
    ).toThrow(ChallengeSimError);
    expect(() =>
      runChallengeSimulation({
        ...BASE,
        mode: "block",
        sequence,
        blockLength: 10_000,
      }),
    ).toThrow(/massima/);
  });
});

describe("streak e drawdown — casi leggibili a mano", () => {
  it("edge fortissimo: dieci perdite di fila restano rare ma NON impossibili", () => {
    // 65% di win rate: dieci perdite consecutive hanno probabilità 0,35¹⁰ ≈
    // 2,8·10⁻⁵ per posizione, ma un tentativo attraversa decine di trade e i
    // percorsi sono 200.000 — su quei numeri l'evento si vede eccome. Uno zero
    // secco qui vorrebbe dire che la streak non viene contata.
    const result = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      binary: { winRate: 0.65, rewardRisk: 2, riskPerTrade: 0.5 },
      paths: 200_000,
    });
    const p10 = result.lossStreak.find((s) => s.length === 10)!.probability;
    expect(p10).toBeGreaterThan(0);
    expect(p10).toBeLessThan(0.05);
  });

  it("edge fortissimo: il drawdown intermedio non è mai zero", () => {
    const result = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      binary: { winRate: 0.65, rewardRisk: 2, riskPerTrade: 0.5 },
      paths: 50_000,
    });
    // Anche vincendo quasi sempre, una parte dei tentativi scende sotto metà
    // del max loss prima di risalire.
    expect(result.drawdownRisk[0].probability).toBeGreaterThan(0);
  });

  it("chi fallisce ha per forza sfondato tutte le soglie intermedie", () => {
    const result = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      binary: { winRate: 0.3, rewardRisk: 1.2, riskPerTrade: 1 },
      paths: 20_000,
    });
    const worst = result.drawdownRisk[result.drawdownRisk.length - 1];
    expect(worst.probability).toBeGreaterThanOrEqual(result.fail - 1e-9);
  });

  it("la mediana dei trade alla risoluzione è positiva e finita", () => {
    const result = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      paths: 5000,
    });
    expect(result.medianTradesToResolve).toBeGreaterThan(0);
    expect(result.medianTradesToResolve).toBeLessThan(3000);
  });
});

describe("runChallengeSimulation — validazione", () => {
  it("sequenza vuota in modalità empirica → errore", () => {
    expect(() =>
      runChallengeSimulation({ ...BASE, mode: "empirical", sequence: [] }),
    ).toThrow(/Nessun trade storico/);
  });

  it("percorsi fuori range → errore", () => {
    expect(() =>
      runChallengeSimulation({ ...BASE, mode: "parametric", paths: 0 }),
    ).toThrow(ChallengeSimError);
    expect(() =>
      runChallengeSimulation({ ...BASE, mode: "parametric", paths: 1e9 }),
    ).toThrow(ChallengeSimError);
  });

  it("esiti che arrotondano tutti a zero → errore, non un ciclo infinito", () => {
    expect(() =>
      runChallengeSimulation({
        ...BASE,
        mode: "parametric",
        binary: { winRate: 0.5, rewardRisk: 1, riskPerTrade: 0.001 },
        paths: 100,
      }),
    ).toThrow(/arrotondano a zero/);
  });

  it("un tetto di trade basso produce percorsi non risolti, non un errore", () => {
    const result = runChallengeSimulation({
      ...BASE,
      mode: "parametric",
      binary: { winRate: 0.5, rewardRisk: 1, riskPerTrade: 0.05 },
      maxTrades: 20,
      paths: 2000,
    });
    expect(result.unresolved).toBeGreaterThan(0.5);
    expect(result.pass + result.fail + result.unresolved).toBeCloseTo(1, 12);
  });
});
