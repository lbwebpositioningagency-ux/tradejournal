import { describe, expect, it } from "vitest";
import { biasAlignment, macroAssetForSymbol } from "./macro-desk";

describe("macroAssetForSymbol (W2)", () => {
  it("oro, petrolio e indici (spot, futures, micro, CFD)", () => {
    expect(macroAssetForSymbol("XAUUSD")).toBe("XAU");
    expect(macroAssetForSymbol("gc")).toBe("XAU");
    expect(macroAssetForSymbol("CL")).toBe("WTI");
    expect(macroAssetForSymbol("USOIL")).toBe("WTI");
    expect(macroAssetForSymbol("ES")).toBe("IDX");
    expect(macroAssetForSymbol("MNQ")).toBe("IDX");
    expect(macroAssetForSymbol("GER40")).toBe("IDX");
  });

  it("simboli fuori dal desk → null (mai classificati a forza)", () => {
    expect(macroAssetForSymbol("EURUSD")).toBeNull();
    expect(macroAssetForSymbol("AAPL")).toBeNull();
    expect(macroAssetForSymbol("")).toBeNull();
  });
});

describe("biasAlignment (W2)", () => {
  it("col bias: LONG+Rialzo, SHORT+Ribasso", () => {
    expect(biasAlignment("LONG", "RIALZISTA")).toBe("ALIGNED");
    expect(biasAlignment("SHORT", "RIBASSISTA")).toBe("ALIGNED");
  });

  it("contro il bias: direzione opposta", () => {
    expect(biasAlignment("SHORT", "RIALZISTA")).toBe("AGAINST");
    expect(biasAlignment("LONG", "RIBASSISTA")).toBe("AGAINST");
  });

  it("NEUTRALE o bias sconosciuto → null (né permesso né divieto)", () => {
    expect(biasAlignment("LONG", "NEUTRALE")).toBeNull();
    expect(biasAlignment("SHORT", "BOH")).toBeNull();
  });
});
