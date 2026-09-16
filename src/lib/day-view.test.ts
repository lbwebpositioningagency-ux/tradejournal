import { describe, expect, it } from "vitest";
import { buildDayViewRows, dayViewDayLabel, isDayViewMode, weekPageHref } from "./day-view";

const pnl = [
  { key: "2026-09-10", netPnl: "120.50", trades: 3 },
  { key: "2026-09-14", netPnl: "-40.00", trades: 1 },
];

describe("buildDayViewRows — giorni", () => {
  it("unisce trade e journal, dal più recente", () => {
    const rows = buildDayViewRows("day", pnl, ["2026-09-12", "2026-09-14"]);
    expect(rows.map((r) => r.key)).toEqual(["2026-09-14", "2026-09-12", "2026-09-10"]);
    expect(rows[0]).toEqual({ key: "2026-09-14", netPnl: "-40.00", trades: 1, journalDays: 1 });
  });
  it("giorno con solo journal: P&L assente, non zero", () => {
    const [row] = buildDayViewRows("day", [], ["2026-09-12"]);
    expect(row).toEqual({ key: "2026-09-12", netPnl: null, trades: 0, journalDays: 1 });
  });
  it("chiavi di journal ripetute contano una volta", () => {
    expect(buildDayViewRows("day", [], ["2026-09-12", "2026-09-12"])[0].journalDays).toBe(1);
  });
  it("niente trade e niente journal: nessuna riga", () => {
    expect(buildDayViewRows("day", [], [])).toEqual([]);
  });
  it("il P&L resta la stringa della query, senza conversioni", () => {
    expect(buildDayViewRows("day", [{ key: "2026-01-02", netPnl: "0.10", trades: 1 }], [])[0].netPnl).toBe("0.10");
  });
});

describe("buildDayViewRows — settimane", () => {
  const weekPnl = [{ key: "2026-09-07", netPnl: "80.50", trades: 4 }];
  it("il journal si conta nel lunedì ISO della sua settimana", () => {
    // 12/09 è sabato, 13/09 domenica: settimana del 7; 14/09 è lunedì.
    const rows = buildDayViewRows("week", weekPnl, ["2026-09-12", "2026-09-13", "2026-09-14"]);
    expect(rows).toEqual([
      { key: "2026-09-14", netPnl: null, trades: 0, journalDays: 1 },
      { key: "2026-09-07", netPnl: "80.50", trades: 4, journalDays: 2 },
    ]);
  });
  it("cambio d'anno: la settimana del 1/1/2026 (giovedì) comincia il 29/12/2025", () => {
    expect(buildDayViewRows("week", [], ["2026-01-01"])[0].key).toBe("2025-12-29");
  });
});

describe("contorno", () => {
  it("modo valido", () => {
    expect(isDayViewMode("day")).toBe(true);
    expect(isDayViewMode("week")).toBe(true);
    expect(isDayViewMode("mese")).toBe(false);
    expect(isDayViewMode(undefined)).toBe(false);
  });
  it("etichetta del giorno", () => {
    expect(dayViewDayLabel("2026-09-15")).toBe("Martedì 15 settembre 2026");
  });
  it("la pagina Settimana non è ancora collegata", () => {
    expect(weekPageHref("2026-09-14")).toBeNull();
  });
});
