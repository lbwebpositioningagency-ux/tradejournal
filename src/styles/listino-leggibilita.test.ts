import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LEGGIBILITÀ MINIMA DEL LISTINO (Macro Desk).
 *
 * Misurato il 14/09/2026 prima della correzione: il grigio delle intestazioni
 * `--md-muted` stava a 4,24:1 sul fondo scuro e 3,57:1 su surface-3; sul
 * chiaro 4,25:1 e 3,64:1. Nella sola Volatilità 99 testi erano sotto gli
 * 11px (intestazioni a 9,5, gruppi a 9, «i» a 8,5, titoli a 10).
 *
 * Qui si verifica, leggendo il CSS vero, che il testo secondario regga 4,5:1
 * su TUTTE e quattro le superfici del desk nei due temi, e che nessuna taglia
 * del listino scenda sotto gli 11px. La palette non cambia: si è spostata
 * solo la luminosità di `--md-muted` (tavola «Correzioni P0» di Claude Design).
 */

const CSS = readFileSync(join(process.cwd(), "src", "styles", "listino.css"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function block(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Blocco CSS non trovato: ${selector}`);
  const tokens = new Map<string, string>();
  for (const m of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens.set(m[1], m[2].toLowerCase());
  }
  return tokens;
}

function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 1, 2].map((i) => lin(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEMI = {
  chiaro: block(".md-listino,\n.md-calendario"),
  scuro: block(".dark .md-listino,\n.dark .md-calendario"),
};
const SUPERFICI = ["md-bg", "md-surface", "md-surface-2", "md-surface-3"];
const TESTI = ["md-text", "md-text-2", "md-muted"];

describe("Listino — testo ≥ 4,5:1 su tutte le superfici", () => {
  for (const [tema, tokens] of Object.entries(TEMI)) {
    for (const testo of TESTI) {
      it(`${testo} regge AA in tema ${tema}`, () => {
        const colore = tokens.get(testo);
        expect(colore, `${testo} in ${tema}`).toBeDefined();
        for (const superficie of SUPERFICI) {
          const fondo = tokens.get(superficie)!;
          const ratio = contrast(colore!, fondo);
          expect(
            ratio,
            `${testo} ${colore} su ${superficie} ${fondo} = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe("Listino — minimo 11px", () => {
  it("nessuna font-size in px sotto gli 11 nel CSS del listino", () => {
    const sotto = [...CSS.matchAll(/font-size:\s*([\d.]+)px/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < 11);
    expect(sotto).toEqual([]);
  });
});
