import { describe, expect, it } from "vitest";
import { withDrawdownBand } from "./pnl-charts";

/**
 * F4 — overlay del drawdown sulla curva di equity. La banda va dal
 * cumulativo al PICCO CORRENTE: dove è spessa, eri sott'acqua.
 */
const point = (day: string, cumulative: number) => ({
  day,
  value: 0,
  cumulative,
});

describe("withDrawdownBand", () => {
  it("curva sempre crescente: nessuna banda, sei sempre sul picco", () => {
    const rows = withDrawdownBand([point("d1", 10), point("d2", 20), point("d3", 30)]);
    expect(rows.every((r) => r.drawdownBand === null)).toBe(true);
  });

  it("dopo un massimo la banda va dal cumulativo al picco raggiunto", () => {
    const rows = withDrawdownBand([
      point("d1", 100),
      point("d2", 60),
      point("d3", 80),
    ]);
    expect(rows[0].drawdownBand).toBeNull();
    expect(rows[1].drawdownBand).toEqual([60, 100]);
    expect(rows[2].drawdownBand).toEqual([80, 100]);
  });

  it("un nuovo massimo azzera la banda e alza il picco", () => {
    const rows = withDrawdownBand([
      point("d1", 100),
      point("d2", 60),
      point("d3", 120),
      point("d4", 90),
    ]);
    expect(rows[2].drawdownBand).toBeNull();
    expect(rows[3].drawdownBand).toEqual([90, 120]);
  });

  it("il picco non scende mai: è un massimo corrente", () => {
    const rows = withDrawdownBand([point("d1", 50), point("d2", 10), point("d3", 20)]);
    expect(rows[1].drawdownBand![1]).toBe(50);
    expect(rows[2].drawdownBand![1]).toBe(50);
  });

  it("curva sotto zero: la banda esiste comunque, il picco è il meno peggio", () => {
    const rows = withDrawdownBand([point("d1", -10), point("d2", -40)]);
    expect(rows[1].drawdownBand).toEqual([-40, -10]);
  });

  it("serie vuota → nessuna riga, mai un picco a −Infinity in pagina", () => {
    expect(withDrawdownBand([])).toEqual([]);
  });
});
