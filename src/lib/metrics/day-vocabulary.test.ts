import { describe, expect, it } from "vitest";
import {
  calmarInfo,
  DAY_UNIT_LABELS,
  DAY_UNIT_NOTES,
  dayCountInfo,
  dayWinRateInfo,
  formatDayCount,
  sharpeInfo,
  sortinoInfo,
  ulcerInfo,
} from "./index";

/**
 * Il debito «denominatori giornate operative»: l'app conta i giorni in tre
 * modi diversi, ciascuno corretto per la sua metrica, e li chiamava tutti
 * "giorni". Questi test tengono il vocabolario allineato ai testi.
 */

describe("formatDayCount — conteggio e unità accordati", () => {
  it("singolare e plurale per ognuna delle tre unità", () => {
    expect(formatDayCount(1, "operative")).toBe("1 giornata operativa");
    expect(formatDayCount(30, "operative")).toBe("30 giornate operative");
    expect(formatDayCount(1, "session")).toBe("1 seduta");
    expect(formatDayCount(34, "session")).toBe("34 sedute");
    expect(formatDayCount(1, "calendar")).toBe("1 giorno di calendario");
    expect(formatDayCount(566, "calendar")).toBe("566 giorni di calendario");
  });

  it("zero prende il plurale, come in italiano", () => {
    expect(formatDayCount(0, "session")).toBe("0 sedute");
  });

  it("le tre unità sono distinte: nessun nome riusato", () => {
    const names = Object.values(DAY_UNIT_LABELS).flatMap((l) => [l.one, l.many]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("ogni metrica per-giornata dichiara QUALE denominatore usa", () => {
  it("Day Win % e giornate positive/negative contano le GIORNATE OPERATIVE", () => {
    expect(dayWinRateInfo.note).toBe(DAY_UNIT_NOTES.operative);
    expect(dayCountInfo.note).toBe(DAY_UNIT_NOTES.operative);
    expect(dayWinRateInfo.formula).toContain("giornate operative");
  });

  it("i rapporti sui rendimenti contano le SEDUTE", () => {
    expect(sortinoInfo.note).toBe(DAY_UNIT_NOTES.session);
    expect(sharpeInfo.note).toBe(DAY_UNIT_NOTES.session);
    expect(ulcerInfo.note).toBe(DAY_UNIT_NOTES.session);
  });

  it("il Calmar conta i GIORNI DI CALENDARIO: un anno ne ha 365, non 252", () => {
    expect(calmarInfo.note).toBe(DAY_UNIT_NOTES.calendar);
    expect(calmarInfo.formula).toContain("giorni di calendario");
  });

  it("nessuna delle tre note è vaga: dice cosa entra e cosa no", () => {
    expect(DAY_UNIT_NOTES.operative).toContain("almeno un trade");
    expect(DAY_UNIT_NOTES.session).toContain("rendimento 0");
    expect(DAY_UNIT_NOTES.calendar).toContain("weekend");
  });
});
