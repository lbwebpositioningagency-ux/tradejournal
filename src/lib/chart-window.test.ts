import { describe, expect, it } from "vitest";
import { nextRange, presetCutoff, presetRange } from "./chart-window";

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

describe("nextRange", () => {
  const current = { startIndex: 200, endIndex: 309 };

  it("scorrimento: l'ampiezza resta quella di prima anche se la striscia arrotonda", () => {
    const out = nextRange(current, { startIndex: 150, endIndex: 258 }, 344);
    expect(out).toEqual({ range: { startIndex: 150, endIndex: 259 }, keepsPreset: true });
  });

  it("scorrimento oltre i bordi: la finestra si ferma, non si stringe", () => {
    expect(nextRange(current, { startIndex: 250, endIndex: 360 }, 344).range).toEqual({
      startIndex: 234,
      endIndex: 343,
    });
    expect(nextRange(current, { startIndex: -5, endIndex: 104 }, 344).range).toEqual({
      startIndex: 0,
      endIndex: 109,
    });
  });

  it("maniglia: un estremo solo cambia, il preset si spegne", () => {
    expect(nextRange(current, { startIndex: 120, endIndex: 309 }, 344)).toEqual({
      range: { startIndex: 120, endIndex: 309 },
      keepsPreset: false,
    });
  });

  it("nessun cambiamento: tutto resta com'è", () => {
    expect(nextRange(current, { ...current }, 344)).toEqual({ range: current, keepsPreset: true });
  });
});
