import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  buildMonthWeeks,
  isValidDateKey,
  isValidMonthKey,
  sumPnl,
} from "./calendar";

describe("isValidMonthKey / isValidDateKey", () => {
  it("accetta chiavi valide", () => {
    expect(isValidMonthKey("2026-07")).toBe(true);
    expect(isValidMonthKey("2026-12")).toBe(true);
    expect(isValidDateKey("2026-07-16")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true); // bisestile
  });

  it("rifiuta chiavi malformate o inesistenti", () => {
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-7")).toBe(false);
    expect(isValidMonthKey("2026-07-01")).toBe(false);
    expect(isValidDateKey("2026-02-31")).toBe(false); // 31 febbraio
    expect(isValidDateKey("2027-02-29")).toBe(false); // non bisestile
    expect(isValidDateKey("16/07/2026")).toBe(false);
  });
});

describe("addMonths", () => {
  it("avanza e arretra dentro l'anno", () => {
    expect(addMonths("2026-07", 1)).toBe("2026-08");
    expect(addMonths("2026-07", -1)).toBe("2026-06");
  });

  it("attraversa il confine d'anno in entrambe le direzioni", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-01", -13)).toBe("2024-12");
  });
});

describe("addDays", () => {
  it("gestisce i confini di mese e i bisestili", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28"); // 2026 non bisestile
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // 2028 bisestile
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("buildMonthWeeks", () => {
  it("luglio 2026 (inizia mercoledì): prima settimana con coda di giugno", () => {
    const weeks = buildMonthWeeks("2026-07");
    expect(weeks[0]).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    // Il 31/07 è venerdì: l'ultima settimana chiude domenica 02/08
    expect(weeks.at(-1)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(weeks).toHaveLength(5);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("febbraio 2027 (28 giorni, inizia lunedì): esattamente 4 settimane piene", () => {
    const weeks = buildMonthWeeks("2027-02");
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe("2027-02-01");
    expect(weeks.at(-1)?.at(-1)).toBe("2027-02-28");
  });
});

describe("sumPnl", () => {
  it("somma Decimal senza errori floating point", () => {
    expect(sumPnl(["0.1", "0.2"])).toBe("0.30"); // non 0.30000000000000004
    expect(sumPnl(["100.50", "-40.25", "-60.25"])).toBe("0.00");
  });

  it("serie vuota → 0.00", () => {
    expect(sumPnl([])).toBe("0.00");
  });
});
