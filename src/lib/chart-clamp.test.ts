import { describe, expect, it } from "vitest";
import { clampLimit, clampValue } from "./chart-clamp";

describe("clampLimit (F23)", () => {
  it("outlier oltre 3×p95 → limite attivo", () => {
    // otto barre da ~600 e un +24975 (il caso dell'audit)
    const values = [-600, 580, -610, 590, -605, 600, -595, 585, 24975];
    const limit = clampLimit(values);
    expect(limit).not.toBeNull();
    expect(limit!).toBeLessThan(24975);
    expect(limit!).toBeGreaterThanOrEqual(600 * 3 * 0.9);
  });

  it("serie omogenea: nessun clamp", () => {
    expect(clampLimit([100, -120, 90, 130, -110, 95, 105, -125])).toBeNull();
  });

  it("serie corta: mai clamp (troppo poco contesto)", () => {
    expect(clampLimit([100, 100, 100000])).toBeNull();
  });

  it("zeri e valori non finiti ignorati", () => {
    expect(clampLimit([0, 0, 0, NaN, Infinity, 0, 0, 0])).toBeNull();
  });
});

describe("clampValue (F23)", () => {
  it("tronca col segno e marca il punto", () => {
    expect(clampValue(24975, 1800)).toEqual({ display: 1800, clamped: true });
    expect(clampValue(-24975, 1800)).toEqual({ display: -1800, clamped: true });
    expect(clampValue(-600, 1800)).toEqual({ display: -600, clamped: false });
    expect(clampValue(500, null)).toEqual({ display: 500, clamped: false });
  });
});
