import { describe, expect, it } from "vitest";
import { formatDateTime, utcToZonedInput, zonedInputToUtc } from "./dates";

const ROME = "Europe/Rome";
const NY = "America/New_York";

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

describe("formatDateTime", () => {
  it("mostra l'orario nel fuso richiesto", () => {
    const date = new Date("2026-07-15T12:30:00.000Z");
    expect(formatDateTime(date, ROME)).toContain("14:30");
    expect(formatDateTime(date, NY)).toContain("08:30");
  });
});
