import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, hex, oklchToSrgb, outOfGamut } from "../../scripts/contrast.mjs";

/**
 * I contrasti del tema si CALCOLANO, non si stimano: è la regola del progetto
 * dalla FASE 10. Finora la verifica era uno script lanciato a mano durante il
 * design pass — così un ritocco alla palette poteva far scendere una coppia
 * sotto soglia senza che nessuno se ne accorgesse.
 *
 * Questo test legge i token DAVVERO SCRITTI in `globals.css` (non una copia
 * degli stessi valori in un fixture: quella passerebbe anche con il CSS
 * divergente) e per ogni combinazione — tema base, 5 accenti, 2 coppie P&L
 * alternative, light e dark — verifica che:
 *   ① il contrasto regga WCAG AA (≥ 4.5:1) su SFONDO e su CARD;
 *   ② il colore stia dentro il gamut sRGB.
 *
 * Il gamut conta quanto il contrasto: un OKLCH fuori gamut viene clampato dal
 * browser, quindi il token dichiara un colore e ne rende un altro — è così
 * che quattro token erano finiti a mentire sulla propria saturazione.
 */

type Color = [number, number, number];

const CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/** Estrae i token oklch di un blocco CSS (`:root`, `.dark`, `[data-…]`). */
function block(selector: string): Map<string, Color> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Blocco CSS non trovato: ${selector}`);
  const tokens = new Map<string, Color>();
  const re = /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;
  for (const m of match[1].matchAll(re)) {
    tokens.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return tokens;
}

const light = block(":root");
const dark = block(".dark");

const SURFACES = {
  light: [light.get("background")!, light.get("card")!],
  // In dark le card sono opache: `--background` e `--card` sono entrambe
  // superfici su cui il testo può finire.
  dark: [dark.get("background")!, dark.get("card")!],
};

interface Check {
  name: string;
  color: Color;
  mode: "light" | "dark";
  /** Se valorizzato, il colore fa anche da FONDO a questo testo. */
  foreground?: Color;
}

function baseChecks(mode: "light" | "dark", tokens: Map<string, Color>): Check[] {
  const names = [
    "foreground",
    "muted-foreground",
    "profit",
    "loss",
    "breakeven",
    "primary",
    "warning",
  ];
  const checks: Check[] = names.map((name) => ({
    name: `${mode} ${name}`,
    color: tokens.get(name)!,
    mode,
  }));
  // Il bottone primario: testo sul fondo dell'accento.
  checks.push({
    name: `${mode} bottone primario`,
    color: tokens.get("primary")!,
    mode,
    foreground: tokens.get("primary-foreground")!,
  });
  return checks;
}

// Anche "blue" e "classic" hanno un blocco esplicito (= default :root/.dark):
// serve alle swatch annidate del picker, e qui viene verificato come gli altri.
const ACCENTS = ["blue", "violet", "emerald", "amber", "rose"];
const PNL_PAIRS = ["classic", "blue-red", "green-violet"];

const checks: Check[] = [
  ...baseChecks("light", light),
  ...baseChecks("dark", dark),
];

for (const accent of ACCENTS) {
  for (const mode of ["light", "dark"] as const) {
    const selector =
      mode === "light"
        ? `[data-accent="${accent}"]`
        : `:where(.dark, .dark *)[data-accent="${accent}"]`;
    const tokens = block(selector);
    checks.push({
      name: `accento ${accent} ${mode}`,
      color: tokens.get("primary")!,
      mode,
      // L'accento resta fondo dei bottoni: il foreground è quello del tema.
      foreground: (mode === "light" ? light : dark).get("primary-foreground")!,
    });
  }
}

for (const pair of PNL_PAIRS) {
  for (const mode of ["light", "dark"] as const) {
    const selector =
      mode === "light"
        ? `[data-pnl="${pair}"]`
        : `:where(.dark, .dark *)[data-pnl="${pair}"]`;
    const tokens = block(selector);
    for (const key of ["profit", "loss"]) {
      checks.push({
        name: `P&L ${pair} ${key} ${mode}`,
        color: tokens.get(key)!,
        mode,
      });
    }
  }
}

describe("palette del tema — contrasto WCAG AA e gamut sRGB", () => {
  it("legge dal CSS tutte le combinazioni attese", () => {
    // 8 base × 2 modi + 5 accenti × 2 + 3 coppie P&L × 2 colori × 2 modi.
    expect(checks.length).toBe(38);
    for (const check of checks) {
      expect(check.color, check.name).toBeDefined();
    }
  });

  it.each(checks.map((c) => [c.name, c] as const))(
    "%s regge AA su sfondo e su card",
    (_name, check) => {
      for (const surface of SURFACES[check.mode]) {
        const ratio = contrast(check.color, surface);
        expect(
          ratio,
          `${check.name} ${hex(...check.color)} su ${hex(...surface)} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(checks.map((c) => [c.name, c] as const))(
    "%s sta dentro il gamut sRGB",
    (_name, check) => {
      expect(
        outOfGamut(...check.color),
        `${check.name} ${hex(...check.color)} verrebbe clampato dal browser`,
      ).toBe(false);
    },
  );

  it.each(
    checks.filter((c) => c.foreground).map((c) => [c.name, c] as const),
  )("%s regge AA come fondo di un bottone", (_name, check) => {
    const ratio = contrast(check.foreground!, check.color);
    expect(
      ratio,
      `testo ${hex(...check.foreground!)} su ${check.name} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

/* ── Macro Desk ─────────────────────────────────────────────────────────────
   I token --md-* sono hex (dark fisso). Qui si verifica che la semantica
   direzionale (up/down, più warn/info del termometro) regga AA su TUTTE e
   quattro le superfici del modulo — inclusa surface-3, il fondo delle card
   in hover — e che gli override daltonici per data-pnl facciano lo stesso. */

function hexBlock(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Blocco CSS non trovato: ${selector}`);
  const tokens = new Map<string, string>();
  for (const m of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens.set(m[1], m[2].toLowerCase());
  }
  return tokens;
}

function hexLuminance(h: string): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const v = h.replace("#", "");
  const [r, g, b] = [0, 1, 2].map((i) =>
    lin(parseInt(v.slice(i * 2, i * 2 + 2), 16) / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexContrast(a: string, b: string): number {
  const [la, lb] = [hexLuminance(a), hexLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const md = hexBlock(".macro-report");
const mdBlueRed = hexBlock('[data-pnl="blue-red"] .macro-report');
const mdGreenViolet = hexBlock('[data-pnl="green-violet"] .macro-report');

const MD_SURFACES = (["bg", "surface", "surface-2", "surface-3"] as const).map(
  (name) => [name, md.get(`md-${name}`)!] as const,
);

// Coppia direzionale EFFETTIVA per palette: gli override cambiano solo il
// colore che la coppia sostituisce, l'altro resta il default del modulo.
const MD_CHECKS: Array<[string, string]> = [
  ["classic up", md.get("md-up")!],
  ["classic down", md.get("md-down")!],
  ["blue-red up", mdBlueRed.get("md-up")!],
  ["blue-red down", mdBlueRed.get("md-down") ?? md.get("md-down")!],
  ["green-violet up", mdGreenViolet.get("md-up") ?? md.get("md-up")!],
  ["green-violet down", mdGreenViolet.get("md-down")!],
  ["warn", md.get("md-warn")!],
  ["info", md.get("md-info")!],
];

describe("Macro Desk — up/down/warn/info AA su tutte le superfici (hover incluso)", () => {
  it("legge i token e le superfici dal CSS", () => {
    for (const [name, surface] of MD_SURFACES) {
      expect(surface, `superficie md-${name}`).toBeDefined();
    }
    for (const [name, color] of MD_CHECKS) {
      expect(color, name).toBeDefined();
    }
  });

  it.each(MD_CHECKS)("%s regge AA su bg, surface, surface-2 e surface-3", (name, color) => {
    for (const [sName, surface] of MD_SURFACES) {
      const ratio = hexContrast(color, surface);
      expect(
        ratio,
        `${name} ${color} su md-${sName} ${surface} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * E-1 — LA STAMPA NON DEVE RIPORTARE IL TEMA SCURO SUL FOGLIO.
 *
 * Il difetto era concreto: il report settimanale ha un bottone «Stampa /
 * salva PDF» e nel CSS non esisteva alcuna regola `@media print`, quindi in
 * tema scuro il testo usciva quasi bianco su carta bianca (i browser
 * stampano il colore del testo ma non gli sfondi).
 *
 * Questo test guarda la DERIVA, che è il modo in cui il difetto tornerebbe:
 * il blocco di stampa deve ridefinire OGNI token che `.dark` ridefinisce, e
 * con lo stesso valore di `:root`. Se domani si aggiunge un token al tema
 * scuro e ci si dimentica della stampa, il gate se ne accorge qui.
 */

/** Token grezzi di un blocco (qualunque valore, non solo oklch a 3 canali). */
function rawTokens(body: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens.set(m[1], m[2].replace(/\s*\/\*[\s\S]*?\*\//g, "").trim());
  }
  return tokens;
}

/**
 * Corpo di un blocco CSS di primo livello, cercato per testo e non per
 * regex: i selettori qui contengono parentesi, punti e virgolette
 * (`:where(.dark, .dark *)[data-pnl="classic"]`) e sfuggirli è più fragile
 * che cercare la graffa di apertura e quella di chiusura a colonna 0.
 */
function bodyAfter(source: string, opening: string, closing: string): string {
  const start = source.indexOf(opening);
  if (start === -1) throw new Error(`Blocco CSS non trovato: ${opening.trim()}`);
  const from = start + opening.length;
  const end = source.indexOf(closing, from);
  if (end === -1) throw new Error(`Blocco CSS non chiuso: ${opening.trim()}`);
  return source.slice(from, end);
}

function topLevelBlock(selector: string): string {
  return bodyAfter(CSS, `\n${selector} {`, "\n}");
}

const PRINT_MEDIA = (() => {
  const start = CSS.indexOf("\n@media print {");
  if (start === -1) throw new Error("Manca il blocco @media print in globals.css");
  return CSS.slice(start);
})();

/** Blocco annidato dentro @media print (indentato di due spazi). */
function printBlock(selector: string): string {
  return bodyAfter(PRINT_MEDIA, `\n  ${selector} {`, "\n  }");
}

describe("E-1 — blocco @media print: il tema scuro non finisce sulla carta", () => {
  const rootTokens = rawTokens(topLevelBlock(":root"));
  const darkTokens = rawTokens(topLevelBlock(".dark"));
  const printTokens = rawTokens(printBlock(".dark"));

  it("esiste un blocco di stampa che neutralizza .dark", () => {
    expect(printTokens.size).toBeGreaterThan(0);
  });

  it("copre OGNI token ridefinito da .dark: nessuna deriva possibile", () => {
    const mancanti = [...darkTokens.keys()].filter((t) => !printTokens.has(t));
    expect(mancanti, `token del tema scuro non neutralizzati in stampa: ${mancanti.join(", ")}`).toEqual([]);
  });

  it("i valori di stampa coincidono con quelli chiari di :root", () => {
    for (const [token, value] of printTokens) {
      expect(value, `--${token} in stampa`).toBe(rootTokens.get(token));
    }
  });

  it("il testo del foreground stampato è SCURO, non il quasi-bianco del dark", () => {
    // La prova diretta del difetto: contrasto del foreground di stampa
    // contro la carta bianca.
    const printFg = block(":root").get("foreground")!;
    const paper: Color = [1, 0, 0];
    expect(contrast(printFg, paper)).toBeGreaterThanOrEqual(4.5);
    // E il foreground del tema scuro, sulla stessa carta, NON reggerebbe.
    expect(contrast(block(".dark").get("foreground")!, paper)).toBeLessThan(4.5);
  });

  it("la coppia P&L scelta dall'utente sopravvive alla stampa nella variante chiara", () => {
    for (const palette of ["classic", "blue-red", "green-violet"]) {
      const printPnl = rawTokens(
        printBlock(`:where(.dark, .dark *)[data-pnl="${palette}"]`),
      );
      const lightPnl = rawTokens(topLevelBlock(`[data-pnl="${palette}"]`));
      expect(printPnl.get("profit"), `${palette} profit`).toBe(lightPnl.get("profit"));
      expect(printPnl.get("loss"), `${palette} loss`).toBe(lightPnl.get("loss"));
    }
  });

  it("il cromo dell'applicazione è nascosto in stampa", () => {
    // header = topbar sticky (switcher conto, tema, avatar, «+»), aside = sidebar.
    expect(PRINT_MEDIA).toMatch(/header,[\s\S]*?display:\s*none/);
    expect(PRINT_MEDIA).toMatch(/aside,/);
  });
});

/**
 * F4 — SUPERFICI TINTE: il contrasto va ricontrollato dove il fondo NON è
 * la card ma la card più una velatura del colore stesso.
 *
 * È il caso introdotto dalle nuove viste (matrice di correlazione, spunte
 * della checklist, «ho seguito il piano») e già presente nelle celle dei
 * calendari: `text-loss` su `bg-loss/20` è testo colorato su un fondo che
 * tende allo stesso colore, quindi il rapporto scende sotto quello misurato
 * su card. Se una di queste combinazioni non regge AA, il numero resta
 * leggibile solo per chi ci vede bene — e il colore, in questo progetto,
 * non è mai l'unica informazione ma deve comunque essere leggibile.
 */

/** Composizione alpha di `fg` su `bg`, entrambi sRGB 0-1. */
function over(fg: number[], bg: number[], alpha: number): number[] {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

function srgbContrast(a: number[], b: number[]): number {
  const lum = ([r, g, bl]: number[]) => {
    const lin = (c: number) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [la, lb] = [lum(a), lum(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe("F4 — testo su fondo velato di un token P&L", () => {
  /**
   * REGOLA, misurata e non stimata: su una superficie velata di --profit o
   * --loss il testo NON può essere lo stesso token. Il rapporto crolla —
   * --loss su card + 30% di --loss vale 3,51:1 in dark, e in light la
   * velatura massima che regge AA è il 7%, troppo pallida per una heatmap.
   * Il testo resta `foreground` (6,2-17:1 su ogni velatura fino al 40%): il
   * colore lo porta il fondo, il segno lo porta il + o il − del numero.
   *
   * Le combinazioni qui sotto sono quelle realmente rese: celle dei tre
   * calendari, matrice di correlazione, bottoni della revisione.
   */
  const CASES: [string, string, string, number][] = [
    ["matrice correlazione · alta", "foreground", "loss", 0.25],
    ["matrice correlazione · media", "foreground", "warning", 0.2],
    ["matrice correlazione · bassa", "foreground", "profit", 0.2],
    ["revisione · piano seguito", "foreground", "profit", 0.15],
    ["revisione · piano tradito", "foreground", "loss", 0.15],
    ["calendario giorno · cella piena", "foreground", "profit", 0.3],
    ["calendario giorno · cella piena (loss)", "foreground", "loss", 0.3],
    ["mini calendario · cella", "foreground", "loss", 0.15],
    ["calendario mensile · cella piena", "foreground", "profit", 0.3],
  ];

  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    const surface = tokens.get("card")!;
    it.each(CASES)(
      `${theme}: %s regge AA`,
      (_name, textToken, tintToken, alpha) => {
        const text = tokens.get(textToken)!;
        const tint = tokens.get(tintToken)!;
        expect(text, `token --${textToken} in ${theme}`).toBeDefined();
        const background = over(
          oklchToSrgb(...tint),
          oklchToSrgb(...surface),
          alpha,
        );
        const ratio = srgbContrast(oklchToSrgb(...text), background);
        expect(
          ratio,
          `${_name} in ${theme}: ${ratio.toFixed(2)}:1 su card + ${Math.round(alpha * 100)}% di --${tintToken}`,
        ).toBeGreaterThanOrEqual(4.5);
      },
    );
  }
});

/**
 * VISUALIZZAZIONE DATI «VETRO» (`--viz-*`, 17/09/2026): famiglia a parte per
 * grafici e mappe, separata dai token semantici. Qui si verifica, dai valori
 * scritti in globals.css, per i due temi e le tre coppie P&L:
 *   ① ogni token opaco e ogni filo traslucido sta nel gamut sRGB;
 *   ② cifra (`viz-foreground`) e secondario (`viz-muted`) reggono 4,5:1 su
 *      ogni gradino (celle opache, senza riflesso dal 17/09 sera);
 *   ③ i tratti dei grafici (archi, anelli, radar) reggono 3:1 sulla card —
 *      la soglia WCAG per la grafica, non per il testo;
 *   ④ i tre gradini si allontanano dalla card, la croma non scende e due
 *      gradini vicini distano almeno 2,5 in ΔE OKLab (×100): le celle scure
 *      differiscono soprattutto in croma, che il rapporto di luminanza non
 *      vede;
 *   ⑤ la famiglia NON riusa i valori dei token semantici: un grafico non
 *      deve poter essere letto come un giudizio di segno.
 */

/** Distanza in OKLab ×100 fra due colori oklch (~2 = appena percepibile). */
function deltaE([L1, C1, H1]: Color, [L2, C2, H2]: Color): number {
  const rad = Math.PI / 180;
  return (
    Math.hypot(
      L1 - L2,
      C1 * Math.cos(H1 * rad) - C2 * Math.cos(H2 * rad),
      C1 * Math.sin(H1 * rad) - C2 * Math.sin(H2 * rad),
    ) * 100
  );
}

/** Token oklch con alfa (`oklch(L C H / N%)`) di un blocco. */
function alphaTokens(selector: string): Map<string, [Color, number]> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Blocco CSS non trovato: ${selector}`);
  const tokens = new Map<string, [Color, number]>();
  const re = /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)%\s*\)/g;
  for (const m of match[1].matchAll(re)) {
    tokens.set(m[1], [[Number(m[2]), Number(m[3]), Number(m[4])], Number(m[5]) / 100]);
  }
  return tokens;
}

describe("visualizzazione dati «vetro» — gamut, testo AA col riflesso, tratti 3:1", () => {
  const temi = [
    ["light", light, ":root", (p: string) => `[data-pnl="${p}"]`] as const,
    ["dark", dark, ".dark", (p: string) => `:where(.dark, .dark *)[data-pnl="${p}"]`] as const,
  ];

  for (const [mode, base, baseSel, selettore] of temi) {
    it(`${mode}: il riflesso del vetro non esiste più`, () => {
      expect(alphaTokens(baseSel).get("viz-sheen")).toBeUndefined();
    });

    for (const palette of PNL_PAIRS) {
      const override = block(selettore(palette));
      const overrideAlpha = alphaTokens(selettore(palette));
      const tok = (n: string) => override.get(n) ?? base.get(n)!;
      const riempimenti = ["profit", "loss"].flatMap((s) =>
        [1, 2, 3].map((g) => [`viz-${s}-${g}`, tok(`viz-${s}-${g}`)] as const),
      );
      const tratti = ["viz-profit", "viz-loss", "viz-neutral", "viz-accent", "viz-scale-mid"].map(
        (n) => [n, tok(n)] as const,
      );

      it.each([...riempimenti, ...tratti])(
        `${mode} ${palette}: --%s dichiarato e nel gamut sRGB`,
        (nome, colore) => {
          expect(colore, `--${nome}`).toBeDefined();
          expect(outOfGamut(...colore), `${nome} ${hex(...colore)} clampato`).toBe(false);
        },
      );

      it(`${mode} ${palette}: i fili traslucidi stanno nel gamut`, () => {
        for (const n of ["viz-profit-edge", "viz-loss-edge"]) {
          const edge = overrideAlpha.get(n) ?? alphaTokens(baseSel).get(n);
          expect(edge, `--${n}`).toBeDefined();
          expect(outOfGamut(...edge![0]), `--${n} clampato`).toBe(false);
        }
      });

      it.each(riempimenti)(
        `${mode} ${palette}: cifra e secondario reggono AA su --%s`,
        (nome, colore) => {
          for (const testo of ["viz-foreground", "viz-muted"]) {
            const ratio = contrast(base.get(testo)!, colore);
            expect(ratio, `--${testo} su ${nome} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
          }
        },
      );

      it.each(tratti)(`${mode} ${palette}: il tratto --%s regge 3:1 sulla card`, (nome, colore) => {
        const ratio = contrast(colore, base.get("card")!);
        expect(ratio, `${nome} su card = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });

      it(`${mode} ${palette}: i gradini si allontanano dalla card, croma mai in calo`, () => {
        for (const segno of ["profit", "loss"]) {
          const scala = [1, 2, 3].map((g) => tok(`viz-${segno}-${g}`));
          const d = scala.map((c) => Math.abs(c[0] - base.get("card")![0]));
          expect(d[1]).toBeGreaterThan(d[0]);
          expect(d[2]).toBeGreaterThan(d[1]);
          expect(scala[1][1]).toBeGreaterThanOrEqual(scala[0][1]);
          expect(scala[2][1]).toBeGreaterThanOrEqual(scala[1][1]);
          expect(deltaE(scala[0], scala[1]), `${segno} 1↔2 in ${mode}`).toBeGreaterThanOrEqual(2.5);
          expect(deltaE(scala[1], scala[2]), `${segno} 2↔3 in ${mode}`).toBeGreaterThanOrEqual(2.5);
        }
      });

      it(`${mode} ${palette}: nessun token viz coincide con un token semantico`, () => {
        const semantici = ["profit", "loss", "breakeven", "warning", "primary"].map((n) =>
          (override.get(n) ?? base.get(n)!).join(" "),
        );
        for (const [nome, colore] of [...riempimenti, ...tratti]) {
          expect(semantici, `--${nome} ripete un token semantico`).not.toContain(colore.join(" "));
        }
      });
    }
  }

  /* Scala della DISCIPLINA (Progress Tracker), ardesia nello stesso vetro:
     indipendente dalle coppie P&L, stesse tre verifiche dei riempimenti. */
  for (const [mode, base, baseSel] of temi) {
    const tinte = [1, 2, 3].map((n) => [`viz-rule-${n}`, base.get(`viz-rule-${n}`)!] as const);

    it.each(tinte)(`${mode} disciplina: --%s dichiarata, in gamut, testo AA`, (nome, colore) => {
      expect(colore, `--${nome} in ${mode}`).toBeDefined();
      expect(outOfGamut(...colore), `${nome} ${hex(...colore)} clampato`).toBe(false);
      for (const testo of ["viz-foreground", "viz-muted"]) {
        const ratio = contrast(base.get(testo)!, colore);
        expect(ratio, `--${testo} su ${nome} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${mode} disciplina: i tre gradini si allontanano dalla card, filo in gamut`, () => {
      const d = tinte.map(([, c]) => Math.abs(c[0] - base.get("card")![0]));
      expect(d[1]).toBeGreaterThan(d[0]);
      expect(d[2]).toBeGreaterThan(d[1]);
      const edge = alphaTokens(baseSel).get("viz-rule-edge");
      expect(edge).toBeDefined();
      expect(outOfGamut(...edge![0])).toBe(false);
    });
  }

  it("le tinte piene --heat-* del 16/09 non esistono più", () => {
    expect(CSS).not.toMatch(/--heat-(profit|loss|rule)-\d:|--heat-(foreground|muted):/);
    expect(PRINT_MEDIA).toMatch(/--viz-rule-3:/);
  });

  it("la famiglia è anche nel blocco di stampa, coppie comprese", () => {
    expect(PRINT_MEDIA).toMatch(/--viz-profit-3:/);
    expect(PRINT_MEDIA).toMatch(/--viz-accent-fill:/);
    for (const palette of ["blue-red", "green-violet"]) {
      const printPnl = rawTokens(printBlock(`:where(.dark, .dark *)[data-pnl="${palette}"]`));
      const lightPnl = rawTokens(topLevelBlock(`[data-pnl="${palette}"]`));
      for (const [k, v] of lightPnl) {
        if (k.startsWith("viz-")) expect(printPnl.get(k), `${palette} --${k} in stampa`).toBe(v);
      }
    }
  });
});

/**
 * CALENDARIO MENSILE — colore PIENO per esito (`--viz-day-*`), identico al
 * riferimento TradeZella e uguale nei due temi. Qui si verifica:
 *   ① i valori della coppia classica sono ESATTAMENTE quelli campionati;
 *   ② il testo bianco regge 4,5:1 su ogni esito, in ogni coppia P&L;
 *   ③ in ogni coppia i tre esiti sono tre colori diversi e il pareggio non è
 *      della stessa famiglia di tinta di utile o perdita (blu/rosso: niente
 *      due blu; verde/viola: niente blu accanto al viola).
 */
describe("calendario mensile — tre esiti a colore pieno, testo AA", () => {
  const root = rawTokens(topLevelBlock(":root"));
  const pair = (p: string) => rawTokens(topLevelBlock(`[data-pnl="${p}"]`));
  const esiti = (p: string) => {
    const o = p === "classic" ? new Map<string, string>() : pair(p);
    return ["profit", "loss", "breakeven"].map(
      (k) => (o.get(`viz-day-${k}`) ?? root.get(`viz-day-${k}`)!).toLowerCase(),
    );
  };
  const fg = root.get("viz-day-foreground")!.toLowerCase();

  it("coppia classica: i colori campionati dal riferimento, testo bianco", () => {
    expect(esiti("classic")).toEqual(["#112e24", "#5c1f1d", "#1e2742"]);
    expect(fg).toBe("#ffffff");
  });

  it("le celle colorate e i loro fili NON cambiano col tema; in scuro solo vuota e fondo del riferimento", () => {
    const dark = rawTokens(topLevelBlock(".dark"));
    expect([...dark.keys()].filter((k) => k.startsWith("viz-day-")).sort()).toEqual(["viz-day-empty", "viz-day-surface"]);
    expect(dark.get("viz-day-empty")!.toLowerCase()).toBe("#262626");
    expect(dark.get("viz-day-surface")!.toLowerCase()).toBe("#181818");
    // Il numero del giorno sulla cella vuota scura è il bianco del riferimento.
    expect(hexContrast(fg, "#262626")).toBeGreaterThanOrEqual(4.5);
  });

  it("filo di 1px campionato dal riferimento, più chiaro della sua tinta", () => {
    const edges = ["profit", "loss", "breakeven"].map((k) => root.get(`viz-day-${k}-edge`)!.toLowerCase());
    expect(edges).toEqual(["#739683", "#b37d7d", "#4a5b8e"]);
    esiti("classic").forEach((fill, i) => {
      expect(hexLuminance(edges[i])).toBeGreaterThan(hexLuminance(fill));
    });
  });

  for (const p of PNL_PAIRS) {
    it(`${p}: testo bianco ≥ 4,5:1 su utile, perdita e pareggio`, () => {
      for (const c of esiti(p)) {
        const ratio = hexContrast(fg, c);
        expect(ratio, `bianco su ${c} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${p}: tre esiti distinti`, () => {
      expect(new Set(esiti(p)).size).toBe(3);
    });
  }

  it("coppie per daltonici: il pareggio lascia il blu quando utile o perdita sono blu o viola", () => {
    expect(esiti("blue-red")[0]).toBe("#1e2742");
    expect(esiti("blue-red")[2]).not.toBe("#1e2742");
    expect(esiti("green-violet")[2]).not.toBe("#1e2742");
  });

  it("le coppie arrivano anche nel blocco di stampa", () => {
    for (const p of ["blue-red", "green-violet"]) {
      const printPnl = rawTokens(printBlock(`:where(.dark, .dark *)[data-pnl="${p}"]`));
      for (const [k, v] of pair(p)) {
        if (k.startsWith("viz-day-")) expect(printPnl.get(k), `${p} --${k}`).toBe(v);
      }
    }
  });
});
