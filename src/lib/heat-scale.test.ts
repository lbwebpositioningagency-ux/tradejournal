import { describe, expect, it } from "vitest";
import { HEAT_TEXT, HEAT_TEXT_MUTED, heatTone } from "./heat-scale";

describe("heatTone — gradino di intensità → vetro della scala condivisa", () => {
  it("un riempimento per gradino, per segno, con il filo della stessa tinta", () => {
    for (const sign of ["profit", "loss"] as const) {
      for (const tier of [1, 2, 3] as const) {
        const classi = heatTone(sign, tier).split(" ");
        expect(classi).toContain(`bg-viz-${sign}-${tier}`);
        expect(classi).toContain(`border-viz-${sign}-edge`);
        expect(classi).toContain("viz-glass");
      }
    }
  });

  it("solo il gradino più intenso ha l'alone", () => {
    expect(heatTone("profit", 3)).toContain("viz-glow-profit");
    expect(heatTone("loss", 3)).toContain("viz-glow-loss");
    expect(heatTone("profit", 2)).not.toContain("viz-glow");
    expect(heatTone("loss", 1)).not.toContain("viz-glow");
  });

  it("il gradino 0 cade sul primo: il segno resta leggibile", () => {
    expect(heatTone("loss", 0)).toBe(heatTone("loss", 1));
  });

  it("nessuna classe della vecchia tinta piena né dei token semantici", () => {
    for (const sign of ["profit", "loss"] as const) {
      for (const tier of [1, 2, 3] as const) {
        expect(heatTone(sign, tier)).not.toMatch(/heat-|bg-(profit|loss)\b/);
      }
    }
  });

  it("il testo sopra le tinte usa i token viz dedicati", () => {
    expect(HEAT_TEXT).toBe("text-viz-foreground");
    expect(HEAT_TEXT_MUTED).toBe("text-viz-muted");
  });
});
