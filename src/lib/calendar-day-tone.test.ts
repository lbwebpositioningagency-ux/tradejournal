import { describe, expect, it } from "vitest";
import { calendarDayTone, DAY_TEXT, dayOutcome } from "./calendar-day-tone";

describe("calendario mensile — colore pieno per esito, nessuna intensità", () => {
  it("il segno del P&L decide l'esito", () => {
    expect(dayOutcome("1496.70")).toBe("profit");
    expect(dayOutcome("113.30")).toBe("profit");
    expect(dayOutcome("-35.00")).toBe("loss");
    expect(dayOutcome("0")).toBe("breakeven");
    expect(dayOutcome("0.00")).toBe("breakeven");
    expect(dayOutcome("-0.00")).toBe("breakeven");
  });

  it("un +113 e un +1.496 hanno la STESSA cella: la scala non esiste più", () => {
    expect(calendarDayTone(dayOutcome("113.30"))).toBe(calendarDayTone(dayOutcome("1496.70")));
    expect(calendarDayTone(dayOutcome("-35"))).toBe(calendarDayTone(dayOutcome("-2159.20")));
  });

  it("tre esiti, tre classi diverse, nessuna della vecchia scala", () => {
    const classi = (["profit", "loss", "breakeven"] as const).map(calendarDayTone);
    expect(new Set(classi).size).toBe(3);
    for (const c of classi) expect(c).not.toMatch(/viz-(profit|loss|rule)-\d|heat|shadow|gradient|ring|glow|glass/);
    // Solo riempimento piatto: nessun filo colorato attorno alla cella.
    expect(calendarDayTone("profit")).toBe("bg-viz-day-profit");
    expect(calendarDayTone("loss")).toBe("bg-viz-day-loss");
    expect(calendarDayTone("breakeven")).toBe("bg-viz-day-breakeven");
    for (const c of classi) expect(c).not.toMatch(/border|edge/);
    expect(DAY_TEXT).toBe("text-viz-day-foreground");
  });
});
