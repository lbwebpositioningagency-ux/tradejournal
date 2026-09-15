import { describe, expect, it } from "vitest";
import { heatTone } from "./heat-scale";

describe("heatTone — gradino di intensità → tinta della scala condivisa", () => {
  it("un gradino per classe, per segno", () => {
    expect(heatTone("profit", 1)).toBe("bg-heat-profit-1");
    expect(heatTone("profit", 2)).toBe("bg-heat-profit-2");
    expect(heatTone("profit", 3)).toBe("bg-heat-profit-3");
    expect(heatTone("loss", 1)).toBe("bg-heat-loss-1");
    expect(heatTone("loss", 3)).toBe("bg-heat-loss-3");
  });

  it("il gradino 0 cade sul primo: il segno resta leggibile", () => {
    expect(heatTone("loss", 0)).toBe("bg-heat-loss-1");
  });
});
