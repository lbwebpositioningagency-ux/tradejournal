import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDayKey,
  formatDurationSec,
  todayKeyInZone,
  utcToZonedInput,
  zonedInputToUtc,
} from "./dates";

const ROME = "Europe/Rome";
const NY = "America/New_York";

describe("formatDayKey", () => {
  it("chiave giorno ISO → data breve dd/MM", () => {
    expect(formatDayKey("2026-05-19")).toBe("19/05");
    expect(formatDayKey("2026-05-19T00:00:00.000Z")).toBe("19/05");
  });

  it("input non-chiave restituito invariato", () => {
    expect(formatDayKey("—")).toBe("—");
    expect(formatDayKey("")).toBe("");
  });
});

describe("zonedInputToUtc", () => {
  it("converte l'ora legale di Roma (UTC+2) in UTC", () => {
    const utc = zonedInputToUtc("2026-07-15T14:30", ROME);
    expect(utc.toISOString()).toBe("2026-07-15T12:30:00.000Z");
  });

  it("converte l'ora solare di Roma (UTC+1) in UTC", () => {
    const utc = zonedInputToUtc("2026-01-15T14:30", ROME);
    expect(utc.toISOString()).toBe("2026-01-15T13:30:00.000Z");
  });

  it("converte New York (UTC-4 in estate) in UTC", () => {
    const utc = zonedInputToUtc("2026-07-15T09:30", NY);
    expect(utc.toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });

  it("accetta anche i secondi", () => {
    const utc = zonedInputToUtc("2026-07-15T14:30:45", ROME);
    expect(utc.toISOString()).toBe("2026-07-15T12:30:45.000Z");
  });

  it("rifiuta formati non validi", () => {
    expect(() => zonedInputToUtc("15/07/2026 14:30", ROME)).toThrow();
    expect(() => zonedInputToUtc("", ROME)).toThrow();
  });

  it("rifiuta date di calendario inesistenti invece del rollover JS", () => {
    expect(() => zonedInputToUtc("2026-02-31T09:00", ROME)).toThrow(/inesistente/);
    expect(() => zonedInputToUtc("2027-02-29T09:00", ROME)).toThrow(/inesistente/);
    // Bisestile valido
    expect(zonedInputToUtc("2028-02-29T09:00", ROME).toISOString()).toBe(
      "2028-02-29T08:00:00.000Z",
    );
  });
});

describe("utcToZonedInput", () => {
  it("è l'inversa di zonedInputToUtc (estate)", () => {
    const original = "2026-07-15T14:30";
    expect(utcToZonedInput(zonedInputToUtc(original, ROME), ROME)).toBe(original);
  });

  it("è l'inversa di zonedInputToUtc (inverno)", () => {
    const original = "2026-01-15T09:00";
    expect(utcToZonedInput(zonedInputToUtc(original, ROME), ROME)).toBe(original);
  });

  it("converte un istante UTC nel fuso di New York", () => {
    const date = new Date("2026-07-15T13:30:00.000Z");
    expect(utcToZonedInput(date, NY)).toBe("2026-07-15T09:30");
  });
});

describe("formatDurationSec", () => {
  it("secondi, minuti, ore", () => {
    expect(formatDurationSec("30")).toBe("30s");
    expect(formatDurationSec("2700")).toBe("45m");
    expect(formatDurationSec("8040")).toBe("2h 14m");
  });

  it("oltre le 24 ore passa ai giorni (trade multi-day)", () => {
    expect(formatDurationSec("93600")).toBe("1g 2h"); // 26h
    expect(formatDurationSec("266400")).toBe("3g 2h"); // 74h
    expect(formatDurationSec("86399")).toBe("23h 59m");
  });

  it("null, negativi e non numerici → em dash", () => {
    expect(formatDurationSec(null)).toBe("—");
    expect(formatDurationSec("-5")).toBe("—");
    expect(formatDurationSec("abc")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("mostra l'orario nel fuso richiesto", () => {
    const date = new Date("2026-07-15T12:30:00.000Z");
    expect(formatDateTime(date, ROME)).toContain("14:30");
    expect(formatDateTime(date, NY)).toContain("08:30");
  });

  it("a cavallo di mezzanotte cambia anche il GIORNO, non solo l'ora", () => {
    // 23:30 UTC = l'01:30 del giorno dopo a Roma.
    const date = new Date("2026-08-12T23:30:00.000Z");
    expect(formatDateTime(date, ROME)).toContain("13/08");
    expect(formatDateTime(date, NY)).toContain("12/08");
  });
});

/**
 * `todayKeyInZone` è la chiave-giorno di un ISTANTE nel fuso dell'utente.
 * Serve ovunque si mostri "quando è successo": renderla dall'ISO UTC
 * (`toISOString().slice(0,10)`) mostra il giorno sbagliato per metà giornata.
 */
describe("todayKeyInZone", () => {
  it("dà il giorno civile del fuso, non quello UTC", () => {
    const tardaSera = new Date("2026-08-12T23:30:00.000Z");
    expect(todayKeyInZone(ROME, tardaSera)).toBe("2026-08-13");
    expect(tardaSera.toISOString().slice(0, 10)).toBe("2026-08-12"); // la lettura sbagliata
  });

  it("funziona anche nei fusi indietro rispetto a UTC", () => {
    const primoMattino = new Date("2026-08-13T02:00:00.000Z");
    expect(todayKeyInZone(ROME, primoMattino)).toBe("2026-08-13");
    expect(todayKeyInZone(NY, primoMattino)).toBe("2026-08-12");
  });
});
