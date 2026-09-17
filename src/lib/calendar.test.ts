import { describe, expect, it } from "vitest";
import {
  addDays,
  greenDaysQuota,
  addMonths,
  buildMonthWeeks,
  calendarHref,
  isValidDateKey,
  isValidMonthKey,
  sumPnl,
  weekDays,
  weekRangeLabel,
  weekStartOf,
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

describe("calendarHref — il calendario vive nella Dashboard", () => {
  it("mese corrente senza parametri: la Dashboard nuda", () => {
    expect(calendarHref(null)).toBe("/dashboard");
  });

  it("dall'esterno porta l'ancora della sezione", () => {
    expect(calendarHref("2026-07", { anchor: true })).toBe(
      "/dashboard?month=2026-07#calendario",
    );
  });

  it("conserva periodo e valuta già scelti, sostituisce il mese", () => {
    expect(
      calendarHref("2026-08", {
        keep: { period: "90d", month: "2026-07", cur: "EUR", from: undefined },
      }),
    ).toBe("/dashboard?period=90d&cur=EUR&month=2026-08");
  });

  it("«Oggi» toglie il mese e tiene il resto", () => {
    expect(calendarHref(null, { keep: { period: "ytd", month: "2025-01" } })).toBe(
      "/dashboard?period=ytd",
    );
  });

  it("la valuta del calendario vince su quella in URL", () => {
    expect(calendarHref("2026-07", { keep: { cur: "USD" }, currency: "EUR" })).toBe(
      "/dashboard?cur=EUR&month=2026-07",
    );
  });
});

describe("settimana del journal (lunedì→domenica)", () => {
  it("il lunedì di ogni giorno della settimana, domenica compresa", () => {
    for (const day of ["2026-07-13", "2026-07-15", "2026-07-18", "2026-07-19"]) {
      expect(weekStartOf(day)).toBe("2026-07-13");
    }
    expect(weekStartOf("2026-07-20")).toBe("2026-07-20");
  });

  it("attraversa mese e anno", () => {
    expect(weekStartOf("2026-07-02")).toBe("2026-06-29");
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29");
  });

  it("coincide con le righe del calendario mensile", () => {
    for (const week of buildMonthWeeks("2026-03")) {
      expect(weekDays(weekStartOf(week[3]))).toEqual(week);
    }
  });

  it("etichetta: mese e anno solo quando cambiano", () => {
    expect(weekRangeLabel("2026-07-13")).toBe("13–19 luglio 2026");
    expect(weekRangeLabel("2026-06-29")).toBe("29 giugno – 5 luglio 2026");
    expect(weekRangeLabel("2025-12-29")).toBe("29 dicembre 2025 – 4 gennaio 2026");
  });
});

describe("greenDaysQuota — giorni verdi in percentuale", () => {
  it("arrotonda all'intero, metà in su", () => {
    expect(greenDaysQuota(13, 19)).toBe("(68%)");
    expect(greenDaysQuota(12, 18)).toBe("(67%)");
    expect(greenDaysQuota(1, 8)).toBe("(13%)"); // 12,5 → 13
    expect(greenDaysQuota(0, 5)).toBe("(0%)");
    expect(greenDaysQuota(7, 7)).toBe("(100%)");
  });

  it("nessuna giornata operativa: nessuna percentuale, mai NaN", () => {
    expect(greenDaysQuota(0, 0)).toBeNull();
  });
});
