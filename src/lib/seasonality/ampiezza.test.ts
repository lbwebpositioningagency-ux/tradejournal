import { describe, expect, it } from "vitest";
import {
  ampiezzeGiornaliere,
  ampiezzeMensili,
  ampiezzeSettimanali,
  misuraAmpiezza,
} from "@/lib/seasonality/ampiezza";
import type { DailyBar } from "@/lib/seasonality/series";

/** Barra con apertura, massimo, minimo e chiusura; senza o/h/l = solo chiusura. */
const b = (date: string, close: number, open?: number, high?: number, low?: number): DailyBar =>
  open === undefined ? { date, close } : { date, close, open, high, low };

describe("misuraAmpiezza", () => {
  it("(massimo − minimo) / apertura della prima barra", () => {
    expect(misuraAmpiezza([b("2024-02-01", 104, 100, 106, 99), b("2024-02-02", 103, 104, 110, 95)])).toBeCloseTo(
      0.15,
      12,
    );
  });

  it("una barra senza massimo e minimo annulla il periodo: mai dalle chiusure", () => {
    expect(misuraAmpiezza([b("2024-02-01", 104, 100, 106, 99), b("2024-02-02", 90)])).toBeNull();
  });

  it("apertura non positiva o periodo vuoto: nessuna misura", () => {
    expect(misuraAmpiezza([b("2024-02-01", 1, 0, 2, 0.5)])).toBeNull();
    expect(misuraAmpiezza([])).toBeNull();
  });

  it("una seduta ferma ha ampiezza zero, non null", () => {
    expect(misuraAmpiezza([b("2024-02-01", 100, 100, 100, 100)])).toBe(0);
  });
});

describe("ampiezzeMensili", () => {
  it("un'osservazione per mese, con la prima data del mese", () => {
    const out = ampiezzeMensili([
      b("2024-01-30", 100, 100, 102, 98),
      b("2024-01-31", 101, 100, 104, 99),
      b("2024-02-01", 104, 100, 106, 99),
      b("2024-02-02", 103, 104, 110, 95),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ year: 2024, bucket: 1, date: "2024-01-30" });
    expect(out[0].ampiezza).toBeCloseTo(0.06, 12);
    expect(out[1]).toMatchObject({ year: 2024, bucket: 2, month: 2 });
    expect(out[1].ampiezza).toBeCloseTo(0.15, 12);
  });

  it("serie a sola chiusura (il WTI spot): nessuna osservazione", () => {
    expect(ampiezzeMensili([b("2024-01-31", 100), b("2024-02-15", 90)])).toEqual([]);
  });
});

describe("ampiezzeSettimanali", () => {
  it("la settimana di capodanno resta una sola, sull'anno ISO", () => {
    // 30/12/2024 e 02/01/2025 stanno entrambi nella settimana 1 del 2025.
    const out = ampiezzeSettimanali([b("2024-12-30", 100, 100, 101, 99), b("2025-01-02", 100, 100, 103, 97)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ year: 2025, bucket: 1, month: 12 });
    expect(out[0].ampiezza).toBeCloseTo(0.06, 12);
  });
});

describe("ampiezzeGiornaliere", () => {
  it("una per seduta feriale, le barre del weekend non contano", () => {
    const out = ampiezzeGiornaliere([
      b("2024-09-06", 100, 100, 102, 99), // venerdì
      b("2024-09-08", 100, 100, 150, 50), // domenica non fusa
      b("2024-09-10", 100, 50, 51, 49), // martedì
    ]);
    expect(out.map((o) => o.bucket)).toEqual([5, 2]);
    expect(out[0].ampiezza).toBeCloseTo(0.03, 12);
    expect(out[1].ampiezza).toBeCloseTo(0.04, 12);
  });
});
