import { describe, expect, it } from "vitest";
import {
  escursioniGiornaliere,
  escursioniMensili,
  escursioniSettimanali,
} from "@/lib/seasonality/escursioni";
import type { DailyBar } from "@/lib/seasonality/series";

const b = (date: string, close: number, high?: number, low?: number): DailyBar =>
  high === undefined || low === undefined
    ? { date, close }
    : { date, close, open: close, high, low };

describe("escursioniMensili", () => {
  it("misura massimo e minimo del mese contro la chiusura del mese precedente", () => {
    const out = escursioniMensili([
      b("2024-01-30", 99, 100, 98),
      b("2024-01-31", 100, 101, 99),
      b("2024-02-01", 104, 110, 95),
      b("2024-02-29", 102, 103, 101),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ year: 2024, bucket: 2, date: "2024-02-01" });
    expect(out[0].mfe).toBeCloseTo(Math.log(110 / 100), 12);
    expect(out[0].mae).toBeCloseTo(Math.log(95 / 100), 12);
  });

  it("MAE e MFE non cambiano segno: un mese tutto sopra il riferimento ha MAE 0", () => {
    const [e] = escursioniMensili([b("2024-01-31", 100, 100, 100), b("2024-02-15", 105, 106, 101)]);
    expect(e.mae).toBe(0);
    expect(e.mfe).toBeGreaterThan(0);
  });

  it("un mese con una seduta senza massimo e minimo non produce un'osservazione", () => {
    expect(
      escursioniMensili([b("2024-01-31", 100, 101, 99), b("2024-02-01", 104, 110, 95), b("2024-02-02", 103)]),
    ).toEqual([]);
  });

  it("dopo un buco d'archivio il mese si salta, non si misura su tre mesi", () => {
    expect(escursioniMensili([b("2024-01-31", 100, 101, 99), b("2024-04-02", 90, 95, 80)])).toEqual([]);
  });

  it("serie senza massimi e minimi (WTI spot): nessuna escursione, mai dalle chiusure", () => {
    expect(escursioniMensili([b("2024-01-31", 100), b("2024-02-15", 90), b("2024-02-28", 110)])).toEqual([]);
  });
});

describe("escursioniSettimanali", () => {
  it("usa le settimane ISO e attraversa il capodanno ISO", () => {
    const out = escursioniSettimanali([
      b("2020-12-31", 100, 100, 100), // giovedì, settimana 53 del 2020
      b("2021-01-04", 97, 101, 96), // lunedì, settimana 1 del 2021
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ year: 2021, bucket: 1, month: 1 });
    expect(out[0].mae).toBeCloseTo(Math.log(0.96), 12);
  });
});

describe("escursioniGiornaliere", () => {
  it("una seduta contro la chiusura della seduta precedente, solo lun-ven", () => {
    const out = escursioniGiornaliere([
      b("2025-03-07", 100, 101, 99),
      b("2025-03-10", 101, 102, 98),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ bucket: 1, month: 3, year: 2025 });
    expect(out[0].mfe).toBeCloseTo(Math.log(1.02), 12);
    expect(out[0].mae).toBeCloseTo(Math.log(0.98), 12);
  });
});
