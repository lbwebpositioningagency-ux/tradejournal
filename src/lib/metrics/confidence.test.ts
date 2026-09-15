import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  blockBootstrapMeanInterval,
  ESTIMATE_MIN_TRADES,
  intervalsDisjoint,
  meanEstimate,
  parseUnits,
  tradesToDistinguishMean,
  tradesToDistinguishRate,
  wilsonInterval,
  winRateEstimate,
} from "./confidence";

describe("wilsonInterval", () => {
  it("valori noti: 5 su 10 → [0,2366; 0,7634]", () => {
    expect(wilsonInterval(5, 10)).toEqual({ lower: "0.2366", upper: "0.7634" });
  });

  it("non esce mai da [0,1]: tutti persi e tutti vinti", () => {
    const zero = wilsonInterval(0, 30)!;
    expect(zero.lower).toBe("0.0000");
    expect(Number(zero.upper)).toBeGreaterThan(0.1);
    const pieno = wilsonInterval(30, 30)!;
    expect(pieno.upper).toBe("1.0000");
    expect(Number(pieno.lower)).toBeLessThan(0.9);
  });

  it("zero prove → null (nessuna divisione per zero)", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it("si stringe col campione: ±17 punti su 30, ±4 su 623", () => {
    const w30 = wilsonInterval(15, 30)!;
    const w623 = wilsonInterval(307, 623)!;
    expect(Number(w30.upper) - Number(w30.lower)).toBeGreaterThan(0.3);
    expect(Number(w623.upper) - Number(w623.lower)).toBeLessThan(0.08);
  });
});

describe("blockBootstrapMeanInterval", () => {
  const serie = Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? -10000 : 8000));

  it("deterministico a seme fisso", () => {
    expect(blockBootstrapMeanInterval(serie, 100)).toEqual(blockBootstrapMeanInterval(serie, 100));
  });

  it("contiene la media campionaria e ha l'unità della stima", () => {
    const i = blockBootstrapMeanInterval(serie, 100)!;
    const media = serie.reduce((a, b) => a + b, 0) / serie.length / 100;
    expect(Number(i.lower)).toBeLessThanOrEqual(media);
    expect(Number(i.upper)).toBeGreaterThanOrEqual(media);
  });

  it("serie costante → intervallo di ampiezza zero", () => {
    expect(blockBootstrapMeanInterval(Array(40).fill(250), 100)).toEqual({
      lower: "2.5000",
      upper: "2.5000",
    });
  });

  it("meno di 2 valori → null", () => {
    expect(blockBootstrapMeanInterval([], 100)).toBeNull();
    expect(blockBootstrapMeanInterval([5], 100)).toBeNull();
  });
});

describe("trade necessari per distinguersi", () => {
  it("media: (1,96·σ/|μ|)² arrotondato per eccesso", () => {
    // σ = 10, μ = 2 → (9,8)² = 96,04 → 97
    expect(tradesToDistinguishMean(new Decimal(2), new Decimal(10))).toBe(97);
    expect(tradesToDistinguishMean(new Decimal(-2), new Decimal(10))).toBe(97);
  });

  it("media zero → mai (null), serie piatta non nulla → subito", () => {
    expect(tradesToDistinguishMean(new Decimal(0), new Decimal(5))).toBeNull();
    expect(tradesToDistinguishMean(new Decimal(3), new Decimal(0))).toBe(2);
  });

  it("win rate contro la soglia di pareggio", () => {
    // p = 0,55, ref = 0,50 → 3,8416 · 0,2475 / 0,0025 = 380,3 → 381
    expect(tradesToDistinguishRate(new Decimal("0.55"), new Decimal("0.5"))).toBe(381);
    expect(tradesToDistinguishRate(new Decimal("0.5"), new Decimal("0.5"))).toBeNull();
  });
});

describe("stime per gruppo — il campione insufficiente è uno stato", () => {
  it("sotto 30 trade: nessun valore, nessun intervallo, n dichiarato", () => {
    const e = meanEstimate(Array(29).fill(100), 100);
    expect(ESTIMATE_MIN_TRADES).toBe(30);
    expect(e).toMatchObject({ value: null, interval: null, n: 29, lowSample: true });
    const w = winRateEstimate(10, 12, "0.4");
    expect(w).toMatchObject({ value: null, interval: null, n: 12, lowSample: true });
  });

  it("tutti in perdita: expectancy negativa e distinta da zero", () => {
    const e = meanEstimate(Array.from({ length: 40 }, (_, i) => -10000 - (i % 5) * 100), 100);
    expect(Number(e.value)).toBeLessThan(0);
    expect(e.distinct).toBe(true);
    const w = winRateEstimate(0, 40, "0.4");
    expect(w.value).toBe("0.0000");
    expect(w.distinct).toBe(true);
  });

  it("rumore attorno a zero: non distinta, e dice quanti trade servirebbero", () => {
    // Valori sparsi fra −100 e +99 (in unità da 100): media ≈ −0,5, σ ≈ 58.
    // Una serie ALTERNATA non va bene qui: a blocchi di 4 ogni blocco ha la
    // stessa somma e il bootstrap, correttamente, non vede dispersione.
    const units = Array.from({ length: 60 }, (_, i) => (((i * 7919) % 200) - 100) * 100);
    const e = meanEstimate(units, 100);
    expect(e.distinct).toBe(false);
    expect(e.tradesNeeded).toBeGreaterThan(60);
  });

  it("win rate senza soglia di pareggio: intervallo sì, confronto no", () => {
    const w = winRateEstimate(20, 40, null);
    expect(w.interval).not.toBeNull();
    expect(w.distinct).toBeNull();
    expect(w.tradesNeeded).toBeNull();
  });
});

describe("intervalsDisjoint e parseUnits", () => {
  it("disgiunti solo se non si toccano", () => {
    expect(intervalsDisjoint({ lower: "0.5", upper: "0.9" }, { lower: "0.1", upper: "0.4" })).toBe(true);
    expect(intervalsDisjoint({ lower: "0.3", upper: "0.9" }, { lower: "0.1", upper: "0.4" })).toBe(false);
    expect(intervalsDisjoint(null, { lower: "0", upper: "1" })).toBe(false);
  });

  it("legge interi dal database, scarta ciò che non è un intero sicuro", () => {
    expect(parseUnits(["12", "-340", "x"])).toEqual([12, -340]);
    expect(parseUnits(null)).toEqual([]);
  });
});
