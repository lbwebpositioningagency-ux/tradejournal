import { describe, expect, it } from "vitest";
import {
  MIN_HEIGHT_DESKTOP,
  MIN_HEIGHT_NARROW,
  minChartHeight,
  seriesColor,
} from "./driver-desk-chart";

/**
 * Le regole di dimensione del grafico sono un VINCOLO permanente, non una
 * preferenza estetica: un grafico basso rende ogni pendenza indistinguibile
 * da una retta. Sono qui in una funzione pura apposta per poterle bloccare
 * con un test — anche contro le regolazioni manuali della fase successiva.
 */

describe("minChartHeight — pavimento di altezza", () => {
  it("desktop: mai sotto 650px", () => {
    expect(minChartHeight(1440, 900)).toBeGreaterThanOrEqual(
      MIN_HEIGHT_DESKTOP,
    );
    expect(minChartHeight(1024, 600)).toBe(MIN_HEIGHT_DESKTOP);
  });

  it("schermi stretti: mai sotto 450px", () => {
    expect(minChartHeight(390, 358)).toBe(MIN_HEIGHT_NARROW);
    expect(minChartHeight(639, 600)).toBe(MIN_HEIGHT_NARROW);
  });

  it("il breakpoint è a 640: da lì vale la soglia desktop", () => {
    expect(minChartHeight(640, 600)).toBe(MIN_HEIGHT_DESKTOP);
  });

  it("mai più largo di 2:1 — su riquadri larghi cresce l'altezza", () => {
    // 1600px di larghezza: 650 darebbe 2,46:1, quindi il pavimento sale a 800
    expect(minChartHeight(1920, 1600)).toBe(800);
    expect(minChartHeight(1920, 1600)).toBeGreaterThanOrEqual(1600 / 2);
  });

  it("il rapporto 2:1 non viene mai superato, a nessuna larghezza", () => {
    for (const w of [320, 640, 900, 1200, 1600, 2400, 3840]) {
      const h = minChartHeight(w, w);
      expect(w / h).toBeLessThanOrEqual(2);
    }
  });

  it("larghezza non ancora misurata (0) → si parte dalla soglia piena", () => {
    expect(minChartHeight(1440, 0)).toBe(MIN_HEIGHT_DESKTOP);
    expect(minChartHeight(0, 0)).toBe(MIN_HEIGHT_DESKTOP);
  });
});

describe("seriesColor — palette senza verde né rosso", () => {
  it("l'asset è la linea neutra di riferimento, non consuma la palette", () => {
    expect(seriesColor(-1, true)).toBe("var(--md-text)");
  });

  it("i componenti girano sulla palette categorica del progetto", () => {
    const usati = [0, 1, 2, 3, 4, 5].map((i) => seriesColor(i, false));
    expect(new Set(usati).size).toBe(6); // sei colori distinti
    for (const c of usati) expect(c).toMatch(/^var\(--md-/);
  });

  it("oltre il sesto componente i colori si riciclano invece di sparire", () => {
    expect(seriesColor(6, false)).toBe(seriesColor(0, false));
  });
});
