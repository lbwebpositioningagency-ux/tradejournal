import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, hex, outOfGamut } from "../../scripts/contrast.mjs";

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
