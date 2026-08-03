import { describe, expect, it } from "vitest";
import {
  describeSample,
  quantileSorted,
  sampleQuality,
  stdevSample,
} from "@/lib/seasonality/stats";

describe("quantileSorted", () => {
  it("interpola come percentile_cont di Postgres", () => {
    const s = [1, 2, 3, 4];
    // pos = 3*0.25 = 0.75 → 1 + (2-1)*0.75
    expect(quantileSorted(s, 0.25)).toBeCloseTo(1.75, 10);
    expect(quantileSorted(s, 0.5)).toBeCloseTo(2.5, 10);
    expect(quantileSorted(s, 0.75)).toBeCloseTo(3.25, 10);
  });

  it("su un solo valore restituisce quel valore per ogni q", () => {
    expect(quantileSorted([7], 0.25)).toBe(7);
    expect(quantileSorted([7], 0.75)).toBe(7);
  });

  it("su array vuoto restituisce NaN, non 0", () => {
    expect(Number.isNaN(quantileSorted([], 0.5))).toBe(true);
  });
});

describe("stdevSample", () => {
  it("usa il denominatore n-1", () => {
    // varianza campionaria di [2,4,4,4,5,5,7,9] = 4.571428…
    expect(stdevSample([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
  });

  it("con una sola osservazione non è definita → null, non 0", () => {
    expect(stdevSample([3])).toBeNull();
  });

  it("con campione vuoto → null", () => {
    expect(stdevSample([])).toBeNull();
  });

  it("resta stabile con media grande e dispersione piccola (livelli di volatilità)", () => {
    // Il caso che rompe la formula a una passata: mai varianza negativa.
    const v = [20.1, 20.2, 20.15, 20.05, 20.3];
    const s = stdevSample(v);
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(0);
    expect(s!).toBeCloseTo(0.09617, 4);
  });
});

describe("describeSample", () => {
  it("calcola il set completo di statistiche oneste", () => {
    const s = describeSample([-2, -1, 1, 2, 4]);
    expect(s).not.toBeNull();
    expect(s!.n).toBe(5);
    expect(s!.mean).toBeCloseTo(0.8, 10);
    expect(s!.median).toBe(1);
    expect(s!.positiveShare).toBeCloseTo(3 / 5, 10);
    expect(s!.p25).toBeCloseTo(-1, 10);
    expect(s!.p75).toBeCloseTo(2, 10);
  });

  it("campione vuoto → null (mai una riga finta a zero)", () => {
    expect(describeSample([])).toBeNull();
  });

  it("tutti negativi → positiveShare 0, non null", () => {
    const s = describeSample([-1, -2, -3]);
    expect(s!.positiveShare).toBe(0);
  });

  it("tutti positivi → positiveShare 1", () => {
    expect(describeSample([1, 2, 3])!.positiveShare).toBe(1);
  });

  it("lo zero NON conta come positivo (rendimento nullo non è un successo)", () => {
    expect(describeSample([0, 0, 1])!.positiveShare).toBeCloseTo(1 / 3, 10);
  });

  it("accetta un predicato alternativo (livelli sopra la mediana storica)", () => {
    const s = describeSample([18, 22, 25], (v) => v > 20);
    expect(s!.positiveShare).toBeCloseTo(2 / 3, 10);
  });

  it("scarta i valori non finiti prima di calcolare", () => {
    const s = describeSample([1, Number.NaN, 3, Number.POSITIVE_INFINITY]);
    expect(s!.n).toBe(2);
    expect(s!.mean).toBe(2);
  });

  it("con soli valori non finiti → null", () => {
    expect(describeSample([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("con una sola osservazione: stdev null, quartili uguali al valore", () => {
    const s = describeSample([5])!;
    expect(s.n).toBe(1);
    expect(s.stdev).toBeNull();
    expect(s.p25).toBe(5);
    expect(s.p75).toBe(5);
    expect(s.median).toBe(5);
  });

  it("non altera l'array in ingresso", () => {
    const input = [3, 1, 2];
    describeSample(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("sampleQuality", () => {
  it("classifica le tre fasce", () => {
    expect(sampleQuality(2)).toBe("critical");
    expect(sampleQuality(4)).toBe("critical");
    expect(sampleQuality(5)).toBe("low");
    expect(sampleQuality(11)).toBe("low");
    expect(sampleQuality(12)).toBe("ok");
    expect(sampleQuality(240)).toBe("ok");
  });
});
