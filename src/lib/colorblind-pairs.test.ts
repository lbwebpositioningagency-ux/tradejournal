import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { oklchToSrgb } from "../../scripts/contrast.mjs";
import {
  oklabDistance,
  worstCaseDistance,
} from "../../scripts/colorblind.mjs";
import { PNL_PALETTES, PNL_PALETTE_HINTS } from "@/lib/constants";

/**
 * COPPIE P&L E DALTONISMO — la verifica che mancava.
 *
 * Il progetto offre tre coppie profitto/perdita e ne dichiara due «adatte al
 * daltonismo rosso-verde». Finora quella dichiarazione poggiava su un
 * ragionamento (la componente b di OKLab, l'asse che protanopia e
 * deuteranopia non collassano): ragionevole e mai misurato.
 *
 * Qui i colori passano davvero per una simulazione di dicromatismo (Viénot,
 * Brignell & Mollon 1999) e si misura quanto restano distanti in OKLab, che
 * è percettivamente uniforme: 0,02 è appena percepibile, 0,10 una differenza
 * modesta, 0,25 una differenza netta.
 *
 * L'invariante che conta non è «tutti i colori sono distinguibili» — il
 * verde/rosso classico non lo è, ed è una scelta legittima di chi non ha
 * quel problema. È che **ciò che l'interfaccia AFFERMA corrisponda a ciò che
 * la misura dice**: se domani qualcuno ritocca una coppia dichiarata adatta
 * e la porta sotto soglia, o promette l'adattamento su una coppia che non ce
 * l'ha, il gate se ne accorge.
 */

const CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

type Oklch = [number, number, number];

function block(opening: string): Map<string, Oklch> {
  const start = CSS.indexOf(opening);
  if (start === -1) throw new Error(`Blocco CSS non trovato: ${opening.trim()}`);
  const from = start + opening.length;
  const body = CSS.slice(from, CSS.indexOf("\n}", from));
  const tokens = new Map<string, Oklch>();
  for (const match of body.matchAll(
    /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g,
  )) {
    tokens.set(match[1], [
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
    ]);
  }
  return tokens;
}

const BASE = { light: block("\n:root {"), dark: block("\n.dark {") };

/** Token effettivi di una coppia P&L in un tema: base più override. */
function paletteTokens(palette: string, theme: "light" | "dark") {
  const override = block(
    theme === "light"
      ? `\n[data-pnl="${palette}"] {`
      : `\n:where(.dark, .dark *)[data-pnl="${palette}"] {`,
  );
  return new Map([...BASE[theme], ...override]);
}

const rgb = (tokens: Map<string, Oklch>, key: string) => {
  const value = tokens.get(key);
  if (!value) throw new Error(`Token --${key} assente`);
  return oklchToSrgb(...value) as number[];
};

/** Distanza netta: sopra questa, due colori restano due colori. */
const SEPARAZIONE_NETTA = 0.25;

/** Palette che l'interfaccia PROMETTE adatte al daltonismo rosso-verde. */
const DICHIARATE_ADATTE = PNL_PALETTES.filter((p) =>
  PNL_PALETTE_HINTS[p].includes("daltonismo"),
);

describe("coppie P&L — la promessa dell'interfaccia contro la misura", () => {
  it("almeno due coppie si dichiarano adatte: se sparissero, il test perde senso", () => {
    expect(DICHIARATE_ADATTE.length).toBeGreaterThanOrEqual(2);
    expect(DICHIARATE_ADATTE).not.toContain("classic");
  });

  const casi = DICHIARATE_ADATTE.flatMap((palette) =>
    (["light", "dark"] as const).map(
      (theme) => [palette, theme] as [string, "light" | "dark"],
    ),
  );

  it.each(casi)(
    "«%s» in %s resta distinguibile con protanopia E deuteranopia",
    (palette, theme) => {
      const tokens = paletteTokens(palette, theme);
      const { distance, type } = worstCaseDistance(
        rgb(tokens, "profit"),
        rgb(tokens, "loss"),
      );
      expect(
        distance,
        `${palette}/${theme}: ${distance.toFixed(3)} con ${type} (serve ≥ ${SEPARAZIONE_NETTA})`,
      ).toBeGreaterThanOrEqual(SEPARAZIONE_NETTA);
    },
  );

  it("il verde/rosso classico NON lo è, e infatti non lo promette", () => {
    // Non è un difetto: è la convenzione di mercato, scelta da chi non ha
    // quel problema. Il test fissa che l'app non la spacci per altro.
    expect(PNL_PALETTE_HINTS.classic).not.toContain("daltonismo");
    for (const theme of ["light", "dark"] as const) {
      const tokens = paletteTokens("classic", theme);
      const { distance } = worstCaseDistance(
        rgb(tokens, "profit"),
        rgb(tokens, "loss"),
      );
      expect(distance).toBeLessThan(SEPARAZIONE_NETTA);
    }
  });

  it("le coppie adatte guadagnano davvero: almeno il doppio della classica", () => {
    for (const theme of ["light", "dark"] as const) {
      const classica = worstCaseDistance(
        rgb(paletteTokens("classic", theme), "profit"),
        rgb(paletteTokens("classic", theme), "loss"),
      ).distance;
      for (const palette of DICHIARATE_ADATTE) {
        const adatta = worstCaseDistance(
          rgb(paletteTokens(palette, theme), "profit"),
          rgb(paletteTokens(palette, theme), "loss"),
        ).distance;
        expect(
          adatta / classica,
          `${palette}/${theme}: ${(adatta / classica).toFixed(2)}× la classica`,
        ).toBeGreaterThan(2);
      }
    }
  });

  it("a vista normale tutte e tre le coppie sono ben separate", () => {
    for (const palette of PNL_PALETTES) {
      for (const theme of ["light", "dark"] as const) {
        const tokens = paletteTokens(palette, theme);
        expect(
          oklabDistance(rgb(tokens, "profit"), rgb(tokens, "loss")),
          `${palette}/${theme} a vista normale`,
        ).toBeGreaterThan(SEPARAZIONE_NETTA);
      }
    }
  });
});

describe("serie categoriche che portano informazione", () => {
  /**
   * Le coppie di token grafici che compaiono nello STESSO grafico e in cui
   * il colore distingue due serie diverse. Oggi ce n'è una: Sharpe e Sortino
   * nelle rolling di /analytics.
   *
   * NON è in questo elenco `chart-1`/`chart-5`, che pure collassano a 0,013
   * sotto protanopia: compaiono insieme solo fra i percorsi dell'equity
   * simulator, dove sono texture decorativa a opacità 0,14-0,07 e
   * l'informazione la portano le bande σ e la linea media. Il modulo lo
   * dichiara già nel commento; qui si dichiara perché l'esclusione è
   * legittima e non una dimenticanza.
   */
  const SERIE_INFORMATIVE: [string, string, string][] = [
    ["rolling · Sharpe vs Sortino", "chart-1", "chart-2"],
  ];

  it.each(SERIE_INFORMATIVE)(
    "%s resta distinguibile in entrambi i temi",
    (_nome, a, b) => {
      for (const theme of ["light", "dark"] as const) {
        const { distance, type } = worstCaseDistance(
          rgb(BASE[theme], a),
          rgb(BASE[theme], b),
        );
        expect(
          distance,
          `${_nome} in ${theme}: ${distance.toFixed(3)} con ${type}`,
        ).toBeGreaterThanOrEqual(SEPARAZIONE_NETTA);
      }
    },
  );
});

describe("breakeven contro profitto e perdita", () => {
  /**
   * Il breakeven ha una colonna sua nell'istogramma R e una tinta sua nelle
   * celle dei calendari. Sotto dicromatismo la distanza da profit e loss
   * scende a ~0,08: percepibile ma non netta.
   *
   * Non si corregge il colore, si verifica che il colore non sia l'unico
   * canale — ed è il motivo per cui questo test guarda il MARKUP e non solo
   * la palette: nell'istogramma la colonna porta l'etichetta «BE» sull'asse,
   * nelle celle il numero dice «0,00».
   */
  it("resta percepibile, anche se non netto", () => {
    for (const theme of ["light", "dark"] as const) {
      const tokens = paletteTokens("classic", theme);
      for (const other of ["profit", "loss"]) {
        const { distance } = worstCaseDistance(
          rgb(tokens, "breakeven"),
          rgb(tokens, other),
        );
        expect(distance, `breakeven/${other} in ${theme}`).toBeGreaterThan(0.05);
      }
    }
  });

  it("nell'istogramma R il colore non è l'unico canale: c'è l'etichetta BE", () => {
    const chart = readFileSync(
      join(process.cwd(), "src/components/charts/r-distribution-chart.tsx"),
      "utf8",
    );
    expect(chart).toContain("BE");
  });
});
