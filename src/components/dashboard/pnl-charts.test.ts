import { describe, expect, it } from "vitest";
import { withPeakLine } from "./pnl-charts";

/**
 * Linea del MASSIMO PRECEDENTE sulla curva di equity (high-water mark).
 *
 * Sostituisce la banda piena fra picco e curva: stessa informazione — la
 * distanza fra la linea e la curva È il drawdown — senza il riempimento
 * rosso che su uno storico con buche lunghe copriva mezzo grafico.
 */
const point = (day: string, cumulative: number) => ({
  day,
  value: 0,
  cumulative,
});

describe("withPeakLine", () => {
  it("curva sempre crescente: la linea coincide con la curva, profondità 0", () => {
    const rows = withPeakLine([point("d1", 10), point("d2", 20), point("d3", 30)]);
    expect(rows.map((r) => r.peak)).toEqual([10, 20, 30]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("dopo un massimo la linea resta lassù e la profondità è negativa", () => {
    const rows = withPeakLine([
      point("d1", 100),
      point("d2", 60),
      point("d3", 80),
    ]);
    expect(rows.map((r) => r.peak)).toEqual([100, 100, 100]);
    expect(rows.map((r) => r.depth)).toEqual([0, -40, -20]);
  });

  it("un nuovo massimo alza la linea e riporta la profondità a zero", () => {
    const rows = withPeakLine([
      point("d1", 100),
      point("d2", 60),
      point("d3", 120),
      point("d4", 90),
    ]);
    expect(rows[2].peak).toBe(120);
    expect(rows[2].depth).toBe(0);
    expect(rows[3].depth).toBe(-30);
  });

  it("il picco non scende mai: è un massimo corrente", () => {
    const rows = withPeakLine([point("d1", 50), point("d2", 10), point("d3", 20)]);
    expect(rows[1].peak).toBe(50);
    expect(rows[2].peak).toBe(50);
  });

  it("curva sotto zero: il picco è il meno peggio, non lo zero", () => {
    const rows = withPeakLine([point("d1", -10), point("d2", -40)]);
    expect(rows[1].peak).toBe(-10);
    expect(rows[1].depth).toBe(-30);
  });

  it("la profondità non è mai positiva: sopra il picco non si può stare", () => {
    const rows = withPeakLine([
      point("d1", 10),
      point("d2", -5),
      point("d3", 40),
      point("d4", 39),
    ]);
    expect(rows.every((r) => r.depth <= 0)).toBe(true);
  });

  it("serie vuota → nessuna riga, mai un picco a −Infinity in pagina", () => {
    expect(withPeakLine([])).toEqual([]);
  });
});
