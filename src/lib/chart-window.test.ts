import { describe, expect, it } from "vitest";
import { presetCutoff, presetRange, sequenceWindow } from "./chart-window";

describe("presetCutoff", () => {
  it("giorni: 30 e 90 giorni di calendario prima dell'ultima giornata", () => {
    expect(presetCutoff("2026-07-27", "30g")).toBe("2026-06-27");
    expect(presetCutoff("2026-03-01", "90g")).toBe("2025-12-01");
  });

  it("mesi: stesso giorno del mese, ripiegato sull'ultimo del mese corto", () => {
    expect(presetCutoff("2026-07-27", "6m")).toBe("2026-01-27");
    expect(presetCutoff("2026-08-31", "6m")).toBe("2026-02-28");
    expect(presetCutoff("2024-02-29", "1a")).toBe("2023-02-28");
    expect(presetCutoff("2026-01-15", "1a")).toBe("2025-01-15");
  });
});

describe("presetRange", () => {
  const days = ["2026-01-02", "2026-01-20", "2026-02-10", "2026-06-30", "2026-07-01", "2026-07-27"];

  it("ancorata all'ultima giornata, giornate strettamente dopo il taglio", () => {
    // 30g → dopo il 27/06: 30/06, 01/07, 27/07.
    expect(presetRange(days, "30g")).toEqual({ startIndex: 3, endIndex: 5 });
    // 6m → dopo il 27/01: dal 10/02.
    expect(presetRange(days, "6m")).toEqual({ startIndex: 2, endIndex: 5 });
  });

  it("preset più lungo della serie e «Tutto» coprono tutto", () => {
    expect(presetRange(days, "1a")).toEqual({ startIndex: 0, endIndex: 5 });
    expect(presetRange(days, "all")).toEqual({ startIndex: 0, endIndex: 5 });
  });

  it("serie vuota o di un giorno solo", () => {
    expect(presetRange([], "6m")).toEqual({ startIndex: 0, endIndex: 0 });
    expect(presetRange(["2026-07-27"], "30g")).toEqual({ startIndex: 0, endIndex: 0 });
  });
});

describe("sequenceWindow", () => {
  it("gli ultimi N trade di una sequenza lunga", () => {
    expect(sequenceWindow(623, "50")).toEqual({
      start: 573,
      count: 50,
      effective: "50",
      options: ["25", "50", "100", "200", "all"],
      showPresets: true,
    });
    expect(sequenceWindow(623, "all")).toMatchObject({ start: 0, count: 623, effective: "all" });
  });

  it("i preset più lunghi della sequenza non compaiono e, se scelti, vale «Tutti»", () => {
    const w = sequenceWindow(87, "100");
    expect(w.options).toEqual(["25", "50", "all"]);
    expect(w).toMatchObject({ start: 0, count: 87, effective: "all", showPresets: true });
    expect(sequenceWindow(87, "50")).toMatchObject({ start: 37, count: 50, effective: "50" });
  });

  it("esattamente N trade: il preset N coincide con «Tutti»", () => {
    expect(sequenceWindow(50, "50")).toMatchObject({ effective: "all", count: 50, options: ["25", "all"] });
  });

  it("25 trade o meno: nessun preset da mostrare", () => {
    expect(sequenceWindow(25, "50")).toMatchObject({ showPresets: false, count: 25, start: 0 });
    expect(sequenceWindow(6, "25")).toMatchObject({ showPresets: false, count: 6, effective: "all" });
    expect(sequenceWindow(0, "50")).toMatchObject({ count: 0, start: 0, showPresets: false });
  });
});
