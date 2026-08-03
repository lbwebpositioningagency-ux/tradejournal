import { describe, expect, it } from "vitest";
import {
  dayOfYear,
  isoWeek,
  isoWeekYear,
  isoWeekday,
  isoWeeksInYear,
  monthScope,
  scopeMonth,
  sessionBucket,
  sessionOfHour,
  zonedParts,
} from "@/lib/seasonality/buckets";

describe("zonedParts", () => {
  it("converte in ora italiana d'INVERNO (CET, UTC+1)", () => {
    const p = zonedParts(new Date("2024-01-15T13:00:00Z"), "Europe/Rome");
    expect(p).toEqual({ year: 2024, month: 1, day: 15, hour: 14 });
  });

  it("converte in ora italiana d'ESTATE (CEST, UTC+2)", () => {
    const p = zonedParts(new Date("2024-07-15T13:00:00Z"), "Europe/Rome");
    expect(p).toEqual({ year: 2024, month: 7, day: 15, hour: 15 });
  });

  it("l'apertura di New York cade alla stessa ora italiana nelle due stagioni", () => {
    // È il motivo per cui i bucket orari sono calcolati due volte e non
    // rietichettati: in UTC queste due aperture stanno in ore diverse.
    const inverno = zonedParts(new Date("2024-01-15T14:30:00Z"), "Europe/Rome");
    const estate = zonedParts(new Date("2024-07-15T13:30:00Z"), "Europe/Rome");
    expect(inverno.hour).toBe(15);
    expect(estate.hour).toBe(15);
  });

  it("la mezzanotte è l'ora 0, mai 24", () => {
    expect(zonedParts(new Date("2024-03-10T23:00:00Z"), "Europe/Rome").hour).toBe(0);
    expect(zonedParts(new Date("2024-03-10T00:00:00Z"), "UTC").hour).toBe(0);
  });

  it("attraversa il cambio di giorno nel fuso locale", () => {
    // 23:30 UTC del 31/12 è già l'1 gennaio a Roma.
    const p = zonedParts(new Date("2023-12-31T23:30:00Z"), "Europe/Rome");
    expect(p).toEqual({ year: 2024, month: 1, day: 1, hour: 0 });
  });

  it("in UTC restituisce i componenti non convertiti", () => {
    const p = zonedParts(new Date("2024-07-15T13:00:00Z"), "UTC");
    expect(p).toEqual({ year: 2024, month: 7, day: 15, hour: 13 });
  });
});

describe("isoWeekday", () => {
  it("lunedì = 1, domenica = 7", () => {
    expect(isoWeekday(2024, 3, 4)).toBe(1); // lunedì
    expect(isoWeekday(2024, 3, 8)).toBe(5); // venerdì
    expect(isoWeekday(2024, 3, 10)).toBe(7); // domenica
  });
});

describe("dayOfYear", () => {
  it("1° gennaio = 1", () => {
    expect(dayOfYear(2024, 1, 1)).toBe(1);
  });

  it("31 dicembre = 366 nell'anno bisestile, 365 altrimenti", () => {
    expect(dayOfYear(2024, 12, 31)).toBe(366);
    expect(dayOfYear(2023, 12, 31)).toBe(365);
  });

  it("il 1° marzo slitta di un giorno tra bisestile e non", () => {
    expect(dayOfYear(2024, 3, 1)).toBe(61);
    expect(dayOfYear(2023, 3, 1)).toBe(60);
  });
});

describe("isoWeek", () => {
  it("il 4 gennaio è sempre nella settimana 1", () => {
    expect(isoWeek(2024, 1, 4)).toBe(1);
    expect(isoWeek(2021, 1, 4)).toBe(1);
  });

  it("a cavallo d'anno assegna la settimana ISO dell'anno precedente", () => {
    // 1 gennaio 2021 è venerdì: appartiene alla settimana 53 del 2020.
    expect(isoWeek(2021, 1, 1)).toBe(53);
  });

  it("il 31 dicembre può cadere nella settimana 1 dell'anno successivo", () => {
    // 31 dicembre 2019 è martedì: settimana 1 del 2020.
    expect(isoWeek(2019, 12, 31)).toBe(1);
  });

  it("copre l'anno con 53 settimane", () => {
    expect(isoWeek(2020, 12, 31)).toBe(53);
  });
});

describe("isoWeekYear", () => {
  it("a inizio anno può appartenere all'anno ISO precedente", () => {
    // 1 gennaio 2021 è venerdì: settimana 53 del 2020.
    expect(isoWeekYear(2021, 1, 1)).toBe(2020);
    expect(isoWeek(2021, 1, 1)).toBe(53);
  });

  it("a fine anno può appartenere all'anno ISO successivo", () => {
    // 31 dicembre 2019 è martedì: settimana 1 del 2020.
    expect(isoWeekYear(2019, 12, 31)).toBe(2020);
    expect(isoWeek(2019, 12, 31)).toBe(1);
  });

  it("in mezzo all'anno coincide con l'anno civile", () => {
    expect(isoWeekYear(2024, 6, 15)).toBe(2024);
  });
});

describe("isoWeeksInYear", () => {
  it("52 settimane nel caso normale", () => {
    expect(isoWeeksInYear(2019)).toBe(52);
    expect(isoWeeksInYear(2021)).toBe(52);
    expect(isoWeeksInYear(2023)).toBe(52);
  });

  it("53 settimane quando il 1° gennaio è giovedì", () => {
    // 1 gennaio 2015 è giovedì.
    expect(isoWeekday(2015, 1, 1)).toBe(4);
    expect(isoWeeksInYear(2015)).toBe(53);
  });

  it("53 settimane quando il 1° gennaio è mercoledì in anno bisestile", () => {
    // 1 gennaio 2020 è mercoledì e il 2020 è bisestile.
    expect(isoWeekday(2020, 1, 1)).toBe(3);
    expect(isoWeeksInYear(2020)).toBe(53);
  });

  it("coincide con la settimana ISO del 28 dicembre, che è sempre l'ultima", () => {
    for (const y of [2015, 2019, 2020, 2021, 2024, 2026]) {
      expect(isoWeeksInYear(y)).toBe(isoWeek(y, 12, 28));
    }
  });
});

describe("sessionOfHour", () => {
  it("usa la stessa partizione delle sessioni dei trade (ora italiana)", () => {
    expect(sessionOfHour(0)).toBe("ASIA");
    expect(sessionOfHour(7)).toBe("ASIA");
    expect(sessionOfHour(8)).toBe("LONDON");
    expect(sessionOfHour(13)).toBe("LONDON");
    expect(sessionOfHour(14)).toBe("NEWYORK");
    expect(sessionOfHour(21)).toBe("NEWYORK");
    expect(sessionOfHour(22)).toBe("OFF");
    expect(sessionOfHour(23)).toBe("OFF");
  });

  it("ogni ora del giorno appartiene a esattamente una sessione", () => {
    const seen = new Set<string>();
    for (let h = 0; h < 24; h += 1) seen.add(sessionOfHour(h));
    expect([...seen].sort()).toEqual(["ASIA", "LONDON", "NEWYORK", "OFF"]);
  });

  it("l'indice di bucket segue l'ordine di SESSIONS", () => {
    expect(sessionBucket(0)).toBe(0);
    expect(sessionBucket(8)).toBe(1);
    expect(sessionBucket(14)).toBe(2);
    expect(sessionBucket(23)).toBe(3);
  });
});

describe("scope del drill", () => {
  it("va e torna dal mese", () => {
    expect(monthScope(1)).toBe("M01");
    expect(monthScope(12)).toBe("M12");
    expect(scopeMonth("M01")).toBe(1);
    expect(scopeMonth("M12")).toBe(12);
  });

  it("ALL e valori non validi non sono un mese", () => {
    expect(scopeMonth("ALL")).toBeNull();
    expect(scopeMonth("M13")).toBeNull();
    expect(scopeMonth("M00")).toBeNull();
    expect(scopeMonth("gennaio")).toBeNull();
  });
});
