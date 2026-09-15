import { describe, expect, it } from "vitest";
import { classeAccento, livelloAccento, soglieAccento } from "./accento";

describe("soglieAccento", () => {
  it("prende 75° e 90° percentile dello scarto assoluto, segno ignorato", () => {
    const scarti = Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : -1) * (i + 1));
    const s = soglieAccento(scarti);
    expect(s.notevole).toBe(76);
    expect(s.forte).toBe(91);
  });

  it("su una griglia vera circa tre caselle su quattro restano neutre", () => {
    // Una distribuzione simmetrica qualunque: la quota neutra dipende dal quantile, non dalla scala.
    const scarti = Array.from({ length: 240 }, (_, i) => Math.sin(i * 1.7) * (1 + (i % 13)));
    const s = soglieAccento(scarti);
    const neutre = scarti.filter((v) => livelloAccento(v, s) === 0).length;
    expect(neutre / scarti.length).toBeGreaterThanOrEqual(0.74);
    expect(neutre / scarti.length).toBeLessThanOrEqual(0.76);
    const forti = scarti.filter((v) => livelloAccento(v, s) === 2).length;
    expect(forti / scarti.length).toBeLessThanOrEqual(0.11);
  });

  it("nessun valore, o tutti zero: nessuna casella colorata", () => {
    expect(soglieAccento([])).toEqual({ notevole: Infinity, forte: Infinity });
    const zeri = soglieAccento([0, 0, 0, 0]);
    expect(livelloAccento(0, zeri)).toBe(0);
    expect(livelloAccento(0.5, zeri)).toBe(0);
  });

  it("i non finiti non entrano nelle soglie", () => {
    const s = soglieAccento([Number.NaN, 1, 2, 3, Infinity, 4]);
    expect(Number.isFinite(s.notevole)).toBe(true);
  });
});

describe("livelloAccento e classeAccento", () => {
  const s = { notevole: 5, forte: 8 };

  it("ordinario, notevole, forte ai due confini", () => {
    expect(livelloAccento(4.99, s)).toBe(0);
    expect(livelloAccento(5, s)).toBe(1);
    expect(livelloAccento(-7.9, s)).toBe(1);
    expect(livelloAccento(-8, s)).toBe(2);
    expect(livelloAccento(Number.NaN, s)).toBe(0);
  });

  it("la classe dice segno e forza, niente per l'ordinario", () => {
    expect(classeAccento(1, s)).toBeUndefined();
    expect(classeAccento(6, s)).toBe("ml-acc-su");
    expect(classeAccento(-6, s)).toBe("ml-acc-giu");
    expect(classeAccento(12, s)).toBe("ml-acc-su ml-acc-forte");
    expect(classeAccento(-12, s)).toBe("ml-acc-giu ml-acc-forte");
  });
});
