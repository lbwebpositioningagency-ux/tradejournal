import { describe, expect, it } from "vitest";
import {
  MIN_HEIGHT_DESKTOP,
  MIN_HEIGHT_NARROW,
  PASSO_MINIMO_TICK,
  axisDomain,
  axisGroup,
  diradaTicks,
  larghezzaUtileAsse,
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
  it("desktop: mai sotto il pavimento dichiarato", () => {
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
    // 1600px di larghezza: il pavimento di 420 darebbe 3,8:1, quindi sale a 800
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

/* ── asse dei mesi ───────────────────────────────────────────────────── */

describe("diradaTicks — le sigle dei mesi non si toccano", () => {
  /* Dodici mesi di sedute danno tredici tick. A tutta larghezza ci stavano;
     da quando il grafico sta a metà scheda l'area di disegno è di 343 px,
     cioè 26 px per etichetta, e le prime due si sovrapponevano. */
  const ULTIMO = 252;
  /** Tredici inizi-mese equidistanti su 252 sedute. */
  const REGOLARI = Array.from({ length: 13 }, (_, i) => Math.round((i * ULTIMO) / 12));

  it("con spazio abbondante non tocca nulla", () => {
    expect(diradaTicks(REGOLARI, ULTIMO, 2000)).toEqual(REGOLARI);
  });

  it("con l'area di disegno di metà scheda ne tiene circa la metà", () => {
    const out = diradaTicks(REGOLARI, ULTIMO, 343);
    expect(out.length).toBeLessThan(REGOLARI.length);
    expect(343 / out.length).toBeGreaterThanOrEqual(PASSO_MINIMO_TICK);
  });

  it("NESSUNA coppia tenuta sta sotto il passo minimo, mai", () => {
    // È l'invariante vera: le altre asserzioni ne sono conseguenze.
    for (const larghezza of [120, 200, 343, 583, 900]) {
      const out = diradaTicks(REGOLARI, ULTIMO, larghezza);
      for (let i = 1; i < out.length; i += 1) {
        const d = ((out[i] - out[i - 1]) / ULTIMO) * larghezza;
        expect(d).toBeGreaterThanOrEqual(PASSO_MINIMO_TICK);
      }
    }
  });

  it("PRIMO BUCKET PARZIALE: il caso che il conteggio non vedeva", () => {
    /* La serie comincia a metà agosto, quindi il secondo inizio-mese arriva
       dopo poche sedute invece che dopo un mese. A 1920 lo spazio per tredici
       etichette c'è (45 px a testa) e una regola basata sul CONTEGGIO le
       teneva tutte: «ago» e «set» restavano attaccate. */
    const parziale = [0, 10, ...REGOLARI.slice(2)];
    const out = diradaTicks(parziale, ULTIMO, 583);
    expect(out).toContain(0);
    expect(out).not.toContain(10); // 10/252 × 583 = 23 px: troppo vicino
    expect(out[out.length - 1]).toBe(parziale[parziale.length - 1]);
  });

  it("il PRIMO e l'ULTIMO restano sempre: un asse dichiara i propri estremi", () => {
    for (const larghezza of [60, 120, 200, 343, 583]) {
      const out = diradaTicks(REGOLARI, ULTIMO, larghezza);
      expect(out[0]).toBe(REGOLARI[0]);
      expect(out[out.length - 1]).toBe(REGOLARI[REGOLARI.length - 1]);
      expect(out.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("quando l'ultimo schiaccia il penultimo, cede il penultimo", () => {
    // 240 e 250 distano 4 px su una larghezza di 100: l'ultimo vince
    expect(diradaTicks([0, 240, 250], ULTIMO, 100)).toEqual([0, 250]);
    // se invece c'è spazio non cede nessuno: 0 → 47 px → 99 px
    expect(diradaTicks([0, 120, 250], ULTIMO, 100)).toEqual([0, 120, 250]);
  });

  it("non inventa tick e non ne riordina: è sempre un sottoinsieme in ordine", () => {
    const out = diradaTicks(REGOLARI, ULTIMO, 150);
    for (const t of out) expect(REGOLARI).toContain(t);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
    expect(new Set(out).size).toBe(out.length);
  });

  it("prima del montaggio (larghezza 0) li tiene tutti, mai zero etichette", () => {
    expect(diradaTicks(REGOLARI, ULTIMO, 0)).toEqual(REGOLARI);
    expect(diradaTicks(REGOLARI, ULTIMO, -10)).toEqual(REGOLARI);
    expect(diradaTicks(REGOLARI, 0, 500)).toEqual(REGOLARI);
  });

  it("due tick o meno non si diradano: sono già i soli estremi", () => {
    expect(diradaTicks([0, 5], ULTIMO, 10)).toEqual([0, 5]);
    expect(diradaTicks([0], ULTIMO, 10)).toEqual([0]);
    expect(diradaTicks([], ULTIMO, 10)).toEqual([]);
  });
});

describe("larghezzaUtileAsse — quanto spazio resta davvero alle etichette", () => {
  it("toglie l'asse destro e il gutter delle pillole quando ci sono", () => {
    expect(larghezzaUtileAsse(534, true)).toBe(534 - 45 - 50 - 96);
    expect(larghezzaUtileAsse(534, false)).toBe(534 - 45);
  });

  it("non scende mai sotto zero", () => {
    expect(larghezzaUtileAsse(50, true)).toBe(0);
    expect(larghezzaUtileAsse(0, true)).toBe(0);
  });
});
