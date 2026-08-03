import { describe, expect, it } from "vitest";
import {
  CELL_OPACITY_MAX,
  CELL_OPACITY_MIN,
  cellBackground,
  decimalsFor,
  formatBucketValue,
  formatStdev,
  unitFor,
} from "@/components/seasonality/format";

/**
 * Contrasto WCAG 2.1 ricalcolato qui, non importato: se il calcolo vivesse
 * nel codice di produzione, un errore lì renderebbe verde anche il test.
 */
function canaleLineare(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminanza([r, g, b]: number[]): number {
  return (
    0.2126 * canaleLineare(r) +
    0.7152 * canaleLineare(g) +
    0.0722 * canaleLineare(b)
  );
}
function contrasto(a: number[], b: number[]): number {
  const l1 = luminanza(a);
  const l2 = luminanza(b);
  const [alto, basso] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (basso + 0.05);
}
function daHex(h: string): number[] {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
/** `color-mix(... p%, transparent)` composto sopra la superficie. */
function composto(fg: number[], sfondo: number[], p: number): number[] {
  const a = p / 100;
  return fg.map((c, i) => c * a + sfondo[i] * (1 - a));
}

/* I valori letterali dei token del terminale, da globals.css. */
const SUPERFICIE = daHex("#111826"); // --md-surface
const TESTO = daHex("#eef2f9"); // --md-text
const PALETTE = {
  "--md-up standard": "#2fd67a",
  "--md-down standard": "#ff4160",
  "--md-up daltonica": "#4a87ff",
  "--md-down daltonica": "#9970ff",
};

describe("contrasto delle celle di heatmap", () => {
  it("ogni colore regge AA 4.5 all'opacità MASSIMA", () => {
    // Il testo delle celle è 10-11px: per WCAG è testo normale, soglia 4,5.
    for (const [nome, hex] of Object.entries(PALETTE)) {
      const c = contrasto(
        TESTO,
        composto(daHex(hex), SUPERFICIE, CELL_OPACITY_MAX),
      );
      expect(c, `${nome} al ${CELL_OPACITY_MAX}%`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("il verde standard è il vincolo: sopra il 54% non regge più", () => {
    // Documenta PERCHÉ il tetto è dov'è: se qualcuno lo alza, questo test
    // spiega cosa si rompe.
    const verde = daHex(PALETTE["--md-up standard"]);
    expect(contrasto(TESTO, composto(verde, SUPERFICIE, 54))).toBeLessThan(4.5);
    expect(
      contrasto(TESTO, composto(verde, SUPERFICIE, 53)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("l'opacità generata resta dentro i limiti dichiarati", () => {
    const debole = cellBackground(0.0001, "RETURN", 1);
    const forte = cellBackground(10, "RETURN", 1);
    expect(debole).toBe("transparent");
    expect(forte).toContain(`${CELL_OPACITY_MAX}%`);
    const medio = cellBackground(0.5, "RETURN", 1);
    const pct = Number(/(\d+)%/.exec(medio)?.[1]);
    expect(pct).toBeGreaterThanOrEqual(CELL_OPACITY_MIN);
    expect(pct).toBeLessThanOrEqual(CELL_OPACITY_MAX);
  });
});

describe("unità di visualizzazione", () => {
  it("i rendimenti sono SEMPRE percentuale, i livelli sempre livello", () => {
    expect(unitFor("RETURN")).toBe("percent");
    expect(unitFor("RETURN")).toBe("percent");
    expect(unitFor("RETURN")).toBe("percent");
    expect(unitFor("LEVEL")).toBe("level");
    // Il livello vince sulla granularità: un indice di volatilità resta un
    // livello anche se un giorno avesse i bucket intraday.
    expect(unitFor("LEVEL")).toBe("level");
  });

  it("sono i DECIMALI a rendere leggibile l'intraday, non un cambio di unità", () => {
    const r = Math.log(1.0000355); // media oraria reale dell'oro
    // Con la precisione del calendario sparirebbe: è il motivo per cui la
    // pagina usava i punti base, ed è il problema che `decimalsFor` risolve
    // senza far cambiare unità a chi legge.
    expect(formatBucketValue(r, "RETURN", 2, "percent")).toBe("+0,00%");
    expect(decimalsFor("RETURN", "HOUR")).toBe(4);
    expect(decimalsFor("RETURN", "SESSION")).toBe(4);
    expect(decimalsFor("RETURN", "MONTH")).toBe(2);
    expect(
      formatBucketValue(r, "RETURN", decimalsFor("RETURN", "HOUR"), "percent"),
    ).toBe("+0,0036%");
  });

  it("la StDev intraday non collassa a zero con i decimali giusti", () => {
    const sigma = 0.000044; // dispersione fra anni di un bucket orario
    expect(formatStdev(sigma, "RETURN", "percent", 2)).toBe("0,00");
    expect(formatStdev(sigma, "RETURN", "percent", 4)).toBe("0,0044");
  });

  it("una statistica non definita è «—», mai zero", () => {
    expect(formatStdev(null, "RETURN")).toBe("—");
    expect(formatBucketValue(Number.NaN, "RETURN")).toBe("—");
  });
});
