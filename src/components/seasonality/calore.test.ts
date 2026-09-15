import { describe, expect, it } from "vitest";
import { attributiCalore, passoCalore, saturazioneCalore } from "./calore";

/** Campione normale ripetibile (LCG + Box-Muller): niente Math.random nei test. */
function normali(n: number): number[] {
  let s = 12345;
  const u = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s + 0.5) / 2147483648;
  };
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()));
}

describe("saturazioneCalore", () => {
  it("è il 95° percentile dello scarto assoluto, segno ignorato", () => {
    const scarti = Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : -1) * (i + 1));
    expect(saturazioneCalore(scarti)).toBe(96);
  });

  it("nessun valore o tutti zero: 0, e nessuna casella si tinge", () => {
    expect(saturazioneCalore([])).toBe(0);
    expect(saturazioneCalore([0, 0, 0])).toBe(0);
    expect(passoCalore(3, 0)).toBeNull();
  });

  it("i non finiti non entrano nella scala", () => {
    expect(saturazioneCalore([Number.NaN, 1, 2, Infinity, 3])).toBe(3);
  });
});

describe("passoCalore", () => {
  it("proporzionale allo scarto, in cinque passi, pieno dalla saturazione in su", () => {
    expect(passoCalore(0.01, 10)).toBe(1);
    expect(passoCalore(2, 10)).toBe(1);
    expect(passoCalore(2.01, 10)).toBe(2);
    expect(passoCalore(-4, 10)).toBe(2);
    expect(passoCalore(6, 10)).toBe(3);
    expect(passoCalore(-8, 10)).toBe(4);
    expect(passoCalore(8.01, 10)).toBe(5);
    expect(passoCalore(10, 10)).toBe(5);
    expect(passoCalore(-37, 10)).toBe(5);
  });

  it("zero e non finiti restano senza tinta", () => {
    expect(passoCalore(0, 10)).toBeNull();
    expect(passoCalore(Number.NaN, 10)).toBeNull();
    expect(passoCalore(Infinity, 10)).toBeNull();
  });

  it("su una distribuzione a campana la maggior parte resta leggera, solo gli estremi pieni", () => {
    const scarti = normali(2000);
    const sat = saturazioneCalore(scarti);
    const conta = [0, 0, 0, 0, 0];
    for (const v of scarti) conta[(passoCalore(v, sat) ?? 1) - 1]++;
    const quota = conta.map((c) => c / scarti.length);
    expect(quota[0] + quota[1]).toBeGreaterThanOrEqual(0.5);
    expect(quota[4]).toBeLessThanOrEqual(0.13);
    expect(quota[4]).toBeGreaterThanOrEqual(0.08);
  });
});

describe("attributiCalore", () => {
  it("la classe dice il segno, data-calore il passo", () => {
    expect(attributiCalore(9, 10)).toEqual({ className: "ml-su", "data-calore": 5 });
    expect(attributiCalore(-1, 10)).toEqual({ className: "ml-giu", "data-calore": 1 });
    expect(attributiCalore(0, 10)).toEqual({});
  });
});
