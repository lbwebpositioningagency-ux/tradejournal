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

const ACCENTS = ["violet", "emerald", "amber", "rose"];
const PNL_PAIRS = ["blue-red", "green-violet"];

const checks: Check[] = [
  ...baseChecks("light", light),
  ...baseChecks("dark", dark),
];

for (const accent of ACCENTS) {
  for (const mode of ["light", "dark"] as const) {
    const selector =
      mode === "light" ? `[data-accent="${accent}"]` : `.dark[data-accent="${accent}"]`;
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
      mode === "light" ? `[data-pnl="${pair}"]` : `.dark[data-pnl="${pair}"]`;
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
    // 7 base × 2 modi + 4 accenti × 2 + 2 coppie P&L × 2 colori × 2 modi.
    expect(checks.length).toBe(30);
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
