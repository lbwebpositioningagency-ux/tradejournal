import { describe, expect, it } from "vitest";
import { signSplitGradients, zeroSplitOffset } from "./chart-spec";

describe("zeroSplitOffset — dove cade lo zero lungo la curva", () => {
  it("tutto sopra zero: tutto verde", () => {
    expect(zeroSplitOffset([0, 120, 480])).toBe(1);
    expect(zeroSplitOffset([10, 20])).toBe(1);
  });

  it("tutto sotto zero (a parte il punto iniziale): tutto rosso", () => {
    expect(zeroSplitOffset([0, -505, -1273])).toBe(0);
    expect(zeroSplitOffset([-5, -10])).toBe(0);
  });

  it("curva che attraversa lo zero: frazione dall'alto = max / (max − min)", () => {
    // Settimana 6–12 luglio 2026: da −1.273 a +449 circa.
    expect(zeroSplitOffset([0, -505, -1273, 449, 24])).toBeCloseTo(449 / (449 + 1273), 10);
    expect(zeroSplitOffset([300, -100])).toBeCloseTo(0.75, 10);
  });

  it("nessun dato o curva piatta: nessuna divisione per zero", () => {
    expect(zeroSplitOffset([])).toBe(1);
    expect(zeroSplitOffset([0, 0, 0])).toBe(1);
    expect(zeroSplitOffset([Number.NaN, 5])).toBe(1);
  });
});

describe("signSplitGradients — linea e area divise per segno", () => {
  it("due gradienti, verde sopra e rosso sotto, tagliati sullo stesso punto", () => {
    const [stroke, fill] = signSplitGradients("x", 0.25);
    expect(stroke.props.id).toBe("x-stroke");
    expect(fill.props.id).toBe("x-fill");
    for (const g of [stroke, fill]) {
      const stops = g.props.children as { props: { offset: string; stopColor: string } }[];
      expect(stops.map((s) => s.props.stopColor)).toEqual(["var(--profit)", "var(--profit)", "var(--loss)", "var(--loss)"]);
      expect(stops.map((s) => s.props.offset)).toEqual(["0%", "25%", "25%", "100%"]);
    }
  });

  it("offset fuori da 0-1 viene riportato nei limiti", () => {
    const [stroke] = signSplitGradients("y", 1.4);
    const stops = stroke.props.children as { props: { offset: string } }[];
    expect(stops[1].props.offset).toBe("100%");
  });
});
