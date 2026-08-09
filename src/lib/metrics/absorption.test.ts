import { describe, expect, it } from "vitest";
import {
  ABSORPTION_GRID_STEP,
  AbsorptionError,
  absorptionAt,
  binaryDistribution,
  computeAbsorptionCurve,
  empiricalDistribution,
  type AbsorptionPoint,
} from "./absorption";

/** Probabilità della curva al livello richiesto (deve cadere su un nodo). */
function at(curve: AbsorptionPoint[], level: number): number {
  const point = curve.find((p) => Math.abs(p.level - level) < 1e-9);
  if (point === undefined) throw new Error(`livello ${level} non sulla griglia`);
  return point.probability;
}

describe("computeAbsorptionCurve — casi noti", () => {
  it("gambler's ruin simmetrico: da metà strada la probabilità è 1/2", () => {
    // 50/50 con salti uguali in valore assoluto e barriere simmetriche: da 0
    // il problema è specularmente identico nelle due direzioni, quindi la
    // risposta è esattamente 0,5 — verificabile a mano, senza formule.
    const curve = computeAbsorptionCurve({
      distribution: [
        { value: 1, probability: 0.5 },
        { value: -1, probability: 0.5 },
      ],
      target: 10,
      drawdown: 10,
      gridStep: ABSORPTION_GRID_STEP,
    });
    expect(at(curve, 0)).toBeCloseTo(0.5, 10);
  });

  it("estremi assorbenti: −drawdown vale 0 e +target vale 1", () => {
    const curve = computeAbsorptionCurve({
      distribution: binaryDistribution({
        winRate: 0.5,
        rewardRisk: 2,
        riskPerTrade: 0.5,
      }),
      target: 8,
      drawdown: 5,
    });
    expect(curve[0]).toEqual({ level: -5, probability: 0 });
    expect(curve[curve.length - 1]).toEqual({ level: 8, probability: 1 });
  });

  it("la curva è monotona crescente nel livello", () => {
    const curve = computeAbsorptionCurve({
      distribution: binaryDistribution({
        winRate: 0.45,
        rewardRisk: 1.8,
        riskPerTrade: 0.5,
      }),
      target: 10,
      drawdown: 10,
    });
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].probability).toBeGreaterThanOrEqual(
        curve[i - 1].probability - 1e-12,
      );
    }
  });

  it("edge zero: la curva è approssimativamente la retta teorica", () => {
    // EV = 0 esatto → martingala → probabilità lineare nel livello. La
    // deviazione residua è tutta overshoot sulle barriere (un salto può
    // superarle e viene collassato sull'assorbente): resta sotto il punto
    // percentuale finché i salti sono piccoli rispetto al range.
    const target = 10;
    const drawdown = 10;
    const curve = computeAbsorptionCurve({
      distribution: [
        { value: 0.1, probability: 0.5 },
        { value: -0.1, probability: 0.5 },
      ],
      target,
      drawdown,
      gridStep: ABSORPTION_GRID_STEP,
    });
    let worst = 0;
    for (const point of curve) {
      const theoretical = (point.level + drawdown) / (target + drawdown);
      worst = Math.max(worst, Math.abs(point.probability - theoretical));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("random walk sbilanciato: coincide con la formula chiusa del gambler's ruin", () => {
    // Salti ±1 punto, barriere a ±10 → passeggiata su interi con 20 unità di
    // range e partenza a 10 unità dal basso. P = (1−r^i)/(1−r^N),
    // r = p_giù / p_su. Controllo esatto, non "circa lineare": se il
    // partizionamento Q/R o il solver sbagliassero, qui si vedrebbe.
    const winRate = 0.55;
    const curve = computeAbsorptionCurve({
      distribution: [
        { value: 1, probability: winRate },
        { value: -1, probability: 1 - winRate },
      ],
      target: 10,
      drawdown: 10,
    });
    const r = (1 - winRate) / winRate;
    for (let units = 1; units < 20; units++) {
      const expected = (1 - r ** units) / (1 - r ** 20);
      expect(at(curve, -10 + units)).toBeCloseTo(expected, 9);
    }
  });

  it("overshoot dichiarato: con salti grandi la curva segue il martingala con barriere sfondate", () => {
    // Partendo da 0,05 con salti ±1 il reticolo raggiungibile non contiene le
    // barriere: si esce a +10,05 o a −10,95. La martingala dà allora
    // p = (x + 11 − a)/21 con a = (x+10) mod 1 — cioè 11/21, NON 0,5025.
    // Il test blinda questo comportamento: non è un bug del solver, è la
    // regola reale (chi sfonda il max loss è fuori, di quanto non conta).
    const curve = computeAbsorptionCurve({
      distribution: [
        { value: 1, probability: 0.5 },
        { value: -1, probability: 0.5 },
      ],
      target: 10,
      drawdown: 10,
    });
    expect(at(curve, 0.05)).toBeCloseTo(11 / 21, 9);
  });
});

describe("computeAbsorptionCurve — convergenza della griglia", () => {
  it("dimezzando il passo la probabilità a 0 si sposta di meno di 0,1 punti", () => {
    // Salti NON multipli del passo (0,83 e −0,37): è il caso in cui
    // l'arrotondamento ai nodi conta davvero. Con passo 0,05 diventano 0,85 e
    // −0,35; con 0,025 diventano 0,825 e −0,375. Se il default fosse troppo
    // grosso, le due risposte divergerebbero.
    const distribution = [
      { value: 0.83, probability: 0.42 },
      { value: -0.37, probability: 0.58 },
    ];
    const coarse = computeAbsorptionCurve({
      distribution,
      target: 10,
      drawdown: 10,
      gridStep: ABSORPTION_GRID_STEP,
    });
    const fine = computeAbsorptionCurve({
      distribution,
      target: 10,
      drawdown: 10,
      gridStep: ABSORPTION_GRID_STEP / 2,
    });
    expect(Math.abs(at(coarse, 0) - at(fine, 0))).toBeLessThan(0.001);
  });

  it("la convergenza tiene anche sulle soglie asimmetriche 8%/5%", () => {
    const distribution = binaryDistribution({
      winRate: 0.48,
      rewardRisk: 1.7,
      riskPerTrade: 0.5,
    });
    const coarse = computeAbsorptionCurve({
      distribution,
      target: 8,
      drawdown: 5,
      gridStep: ABSORPTION_GRID_STEP,
    });
    const fine = computeAbsorptionCurve({
      distribution,
      target: 8,
      drawdown: 5,
      gridStep: ABSORPTION_GRID_STEP / 2,
    });
    expect(Math.abs(at(coarse, 0) - at(fine, 0))).toBeLessThan(0.001);
  });
});

describe("computeAbsorptionCurve — validazione", () => {
  it("target non multiplo del passo → errore esplicito", () => {
    expect(() =>
      computeAbsorptionCurve({
        distribution: [
          { value: 1, probability: 0.5 },
          { value: -1, probability: 0.5 },
        ],
        target: 10.03,
        drawdown: 10,
        gridStep: 0.05,
      }),
    ).toThrow(AbsorptionError);
  });

  it("drawdown non multiplo del passo → errore esplicito", () => {
    expect(() =>
      computeAbsorptionCurve({
        distribution: [
          { value: 1, probability: 0.5 },
          { value: -1, probability: 0.5 },
        ],
        target: 10,
        drawdown: 4.99,
        gridStep: 0.05,
      }),
    ).toThrow(/multiplo esatto/);
  });

  it("i multipli esatti passano nonostante il floating point (1.2 / 0.05)", () => {
    // 1.2 / 0.05 vale 23.999999999999996: un controllo ingenuo con
    // Number.isInteger rifiuterebbe una soglia perfettamente legittima.
    expect(Number.isInteger(1.2 / 0.05)).toBe(false); // la premessa del test
    expect(() =>
      computeAbsorptionCurve({
        distribution: [
          { value: 0.1, probability: 0.5 },
          { value: -0.1, probability: 0.5 },
        ],
        target: 1.2,
        drawdown: 0.6,
        gridStep: 0.05,
      }),
    ).not.toThrow();
  });

  it("probabilità che non sommano a 1 → errore", () => {
    expect(() =>
      computeAbsorptionCurve({
        distribution: [
          { value: 1, probability: 0.5 },
          { value: -1, probability: 0.3 },
        ],
        target: 10,
        drawdown: 10,
      }),
    ).toThrow(/sommano/);
  });

  it("target o drawdown non positivi → errore", () => {
    const distribution = [
      { value: 1, probability: 0.5 },
      { value: -1, probability: 0.5 },
    ];
    expect(() =>
      computeAbsorptionCurve({ distribution, target: 0, drawdown: 10 }),
    ).toThrow(AbsorptionError);
    expect(() =>
      computeAbsorptionCurve({ distribution, target: 10, drawdown: -1 }),
    ).toThrow(AbsorptionError);
  });

  it("tutti gli esiti arrotondati a zero → errore, non una curva finta", () => {
    expect(() =>
      computeAbsorptionCurve({
        distribution: [
          { value: 0.001, probability: 0.5 },
          { value: -0.001, probability: 0.5 },
        ],
        target: 10,
        drawdown: 10,
        gridStep: 0.05,
      }),
    ).toThrow(/arrotondano a zero/);
  });

  it("distribuzione vuota → errore", () => {
    expect(() =>
      computeAbsorptionCurve({ distribution: [], target: 10, drawdown: 10 }),
    ).toThrow(AbsorptionError);
  });
});

describe("absorptionAt", () => {
  const curve = computeAbsorptionCurve({
    distribution: [
      { value: 1, probability: 0.5 },
      { value: -1, probability: 0.5 },
    ],
    target: 10,
    drawdown: 10,
  });

  it("sui nodi restituisce il valore del nodo", () => {
    expect(absorptionAt(curve, 0)).toBeCloseTo(at(curve, 0), 12);
    expect(absorptionAt(curve, 2.5)).toBeCloseTo(at(curve, 2.5), 12);
  });

  it("fra due nodi interpola linearmente", () => {
    const lo = at(curve, 0);
    const hi = at(curve, 0.05);
    expect(absorptionAt(curve, 0.025)).toBeCloseTo((lo + hi) / 2, 12);
  });

  it("fuori range si aggancia agli assorbenti", () => {
    expect(absorptionAt(curve, -50)).toBe(0);
    expect(absorptionAt(curve, 50)).toBe(1);
  });
});

describe("binaryDistribution / empiricalDistribution", () => {
  it("il modello parametrico produce i due esiti attesi", () => {
    expect(
      binaryDistribution({ winRate: 0.4, rewardRisk: 2, riskPerTrade: 0.5 }),
    ).toEqual([
      { value: 1, probability: 0.4 },
      { value: -0.5, probability: 0.6 },
    ]);
  });

  it("l'istogramma empirico diventa una distribuzione normalizzata", () => {
    const result = empiricalDistribution(
      [
        { bin: 20, count: 3 },
        { bin: -10, count: 7 },
      ],
      0.05,
    );
    expect(result?.sample).toBe(10);
    expect(result?.distribution).toEqual([
      { value: 1, probability: 0.3 },
      { value: -0.5, probability: 0.7 },
    ]);
    const sum =
      result?.distribution.reduce((s, o) => s + o.probability, 0) ?? 0;
    expect(sum).toBeCloseTo(1, 12);
  });

  it("nessun trade → null, non una distribuzione vuota", () => {
    expect(empiricalDistribution([], 0.05)).toBeNull();
  });

  it("la distribuzione empirica alimenta la curva senza errori", () => {
    const result = empiricalDistribution(
      [
        { bin: 40, count: 45 },
        { bin: 0, count: 5 },
        { bin: -20, count: 60 },
      ],
      0.05,
    );
    const curve = computeAbsorptionCurve({
      distribution: result!.distribution,
      target: 10,
      drawdown: 10,
    });
    // Un bin a zero (breakeven) è un self-loop legittimo: la catena resta
    // risolvibile perché gli altri bin muovono.
    expect(at(curve, 0)).toBeGreaterThan(0);
    expect(at(curve, 0)).toBeLessThan(1);
  });
});

describe("distribuzione empirica — nessun taglio delle code", () => {
  /**
   * Il senso della modalità storica è che gli eventi brutti ci siano. Questi
   * test blindano che nessuno strato — binning, normalizzazione, motore —
   * escluda, tronchi o smussi un valore estremo.
   */
  it("un bin estremo sopravvive intatto alla normalizzazione", () => {
    // −8% su un solo trade: enorme rispetto agli altri, ma dentro le barriere.
    const result = empiricalDistribution(
      [
        { bin: -160, count: 1 },
        { bin: -10, count: 40 },
        { bin: 20, count: 59 },
      ],
      0.05,
    );
    expect(result?.sample).toBe(100);
    expect(result?.distribution).toContainEqual({
      value: -8,
      probability: 0.01,
    });
  });

  it("una singola perdita anomala sposta il risultato in modo materiale", () => {
    // Stesso campione, stessa somma di P&L, stesso numero di trade: cambia
    // solo la FORMA. Un modello che trattasse il −8% come outlier da
    // escludere (o lo clippasse alla perdita media) darebbe lo stesso numero
    // delle due distribuzioni. Non deve.
    const senzaCoda = empiricalDistribution(
      [
        { bin: -10, count: 41 },
        { bin: 20, count: 59 },
      ],
      0.05,
    )!;
    const conCoda = empiricalDistribution(
      [
        { bin: -160, count: 1 },
        { bin: -7, count: 40 },
        { bin: 20, count: 59 },
      ],
      0.05,
    )!;
    const passaggio = (distribution: typeof senzaCoda.distribution) =>
      at(
        computeAbsorptionCurve({ distribution, target: 10, drawdown: 10 }),
        0,
      );
    // La coda pesa: non un decimale di differenza, ma punti percentuali.
    expect(
      Math.abs(passaggio(senzaCoda.distribution) - passaggio(conCoda.distribution)),
    ).toBeGreaterThan(0.01);
  });

  it("un esito oltre la barriera resta nella distribuzione (assorbe, non sparisce)", () => {
    // Un trade da −15% con drawdown a 10 non viene scartato: da QUALSIASI
    // livello porta direttamente al fallimento, ed è esattamente ciò che
    // succede nella realtà.
    const result = empiricalDistribution(
      [
        { bin: -300, count: 5 },
        { bin: 20, count: 95 },
      ],
      0.05,
    )!;
    expect(result.distribution).toContainEqual({
      value: -15,
      probability: 0.05,
    });
    const curve = computeAbsorptionCurve({
      distribution: result.distribution,
      target: 10,
      drawdown: 10,
    });
    // 5% di probabilità di morte istantanea a ogni trade: il passaggio resta
    // possibile ma lontano dalla certezza che darebbe la sola parte "pulita".
    expect(at(curve, 0)).toBeGreaterThan(0);
    expect(at(curve, 0)).toBeLessThan(0.95);
  });

  it("la somma delle probabilità resta 1 anche con code lunghe", () => {
    const bins = Array.from({ length: 200 }, (_, i) => ({
      bin: i - 100,
      count: i === 0 ? 1 : 3,
    }));
    const result = empiricalDistribution(bins, 0.05)!;
    const total = result.distribution.reduce((s, o) => s + o.probability, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(result.distribution.length).toBe(bins.length);
  });
});
