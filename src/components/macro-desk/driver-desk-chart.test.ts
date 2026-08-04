import { describe, expect, it } from "vitest";
import {
  MIN_HEIGHT_DESKTOP,
  MIN_HEIGHT_NARROW,
  axisDomain,
  axisGroup,
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

/* ───────── Doppio asse (R6): un dominio per gruppo, toggle separati ───────── */

describe("axisGroup / axisDomain — scale indipendenti", () => {
  const mk = (
    key: string,
    role: "main" | "basket" | "driver",
    values: number[],
  ) => ({
    key,
    label: key,
    role,
    values,
    last: values[values.length - 1],
    risingMeans: "",
  });

  const serie = [
    mk("ORO", "main", [0, 10, 20]),
    mk("ARG", "basket", [0, 25, 50]),
    mk("DXY", "driver", [0, -2, -4]),
    mk("REALE", "driver", [0, 3, 8]),
  ];

  it("strumento e paniere a sinistra, driver a destra", () => {
    expect(axisGroup("main")).toBe("left");
    expect(axisGroup("basket")).toBe("left");
    expect(axisGroup("driver")).toBe("right");
  });

  it("ogni asse copre SOLO le linee del proprio gruppo (verifica a mano)", () => {
    const nessuna = new Set<string>();
    // sinistra: min 0, max 50 → pad 6% = 3 → [−3, 53]
    expect(axisDomain(serie, nessuna, "left")).toEqual([-3, 53]);
    // destra: min −4, max 8 → range 12, pad 0,72 → [−4,72, 8,72]
    const [rMin, rMax] = axisDomain(serie, nessuna, "right");
    expect(rMin).toBeCloseTo(-4.72, 10);
    expect(rMax).toBeCloseTo(8.72, 10);
  });

  it("spegnere una linea ri-zooma SOLO il suo asse", () => {
    const spentoArg = new Set(["ARG"]);
    // sinistra ora copre solo l'oro: [0,20] → [−1,2, 21,2]
    const [lMin, lMax] = axisDomain(serie, spentoArg, "left");
    expect(lMin).toBeCloseTo(-1.2, 10);
    expect(lMax).toBeCloseTo(21.2, 10);
    // destra IDENTICA a prima: il toggle non era del suo gruppo
    const [rMin, rMax] = axisDomain(serie, spentoArg, "right");
    expect(rMin).toBeCloseTo(-4.72, 10);
    expect(rMax).toBeCloseTo(8.72, 10);
  });

  it("spegnere un driver ri-zooma la destra e lascia ferma la sinistra", () => {
    const spentoDxy = new Set(["DXY"]);
    const [rMin, rMax] = axisDomain(serie, spentoDxy, "right");
    // resta solo REALE: [0,8] → pad 0,48
    expect(rMin).toBeCloseTo(-0.48, 10);
    expect(rMax).toBeCloseTo(8.48, 10);
    expect(axisDomain(serie, spentoDxy, "left")).toEqual([-3, 53]);
  });

  it("gruppo tutto spento → dominio di riserva, mai NaN", () => {
    const tuttiDriverSpenti = new Set(["DXY", "REALE"]);
    expect(axisDomain(serie, tuttiDriverSpenti, "right")).toEqual([-1, 1]);
  });
});
