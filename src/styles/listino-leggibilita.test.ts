import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * IL LISTINO DENTRO IL SISTEMA UNICO (sistema v2, 14/09/2026).
 *
 * Il 14/09/2026 il grigio secondario del listino era stato portato ad AA con
 * esadecimali suoi. Col sistema v2 il desk non ha più una palette propria:
 * ogni token --md-* è un ALIAS di un token dell'app. Questo test sorveglia
 * tre cose, leggendo i CSS veri:
 *  1. nessun colore scritto a mano nei blocchi di token del listino;
 *  2. i token dell'app a cui rimandano reggono 4,5:1 su background e card,
 *     nei due temi (quelli di base li sorveglia già `theme-contrast.test.ts`;
 *     qui quelli nati col sistema v2: testo secondario e dati categorici);
 *  3. il minimo di 11px e la regola delle tabelle larghe.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const LISTINO = read("src/styles/listino.css");
const GLOBALS = read("src/app/globals.css");

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Blocco CSS non trovato: ${selector}`);
  return match[1];
}

function tokens(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/* oklch → sRGB lineare → luminanza relativa (WCAG). */
function luminanceOklch(value: string): number {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`Non oklch: ${value}`);
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminanceOklch(a), luminanceOklch(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("Listino — alias, non una seconda palette", () => {
  const listino = tokens(block(LISTINO, ".md-listino,\n.md-calendario"));

  it("ogni token di colore del desk rimanda a un token dell'app", () => {
    const colori = [...listino.entries()].filter(([k]) => !/^md-(r-|shadow)/.test(k));
    expect(colori.length).toBeGreaterThanOrEqual(20);
    for (const [k, v] of colori) {
      expect(v, `--${k}`).toMatch(/^var\(--[\w-]+\)$/);
    }
  });

  it("nessun esadecimale né override daltonico del desk nel listino", () => {
    expect(LISTINO).not.toMatch(/--md-[\w-]+:\s*#[0-9a-f]{3,8}/i);
    expect(LISTINO).not.toMatch(/\[data-pnl=[^\]]+\]\s+\.md-(listino|calendario)/);
  });
});

describe("Token nati col sistema v2 — ≥ 4,5:1 su background e card", () => {
  const TEMI = {
    chiaro: tokens(block(GLOBALS, ":root")),
    scuro: tokens(block(GLOBALS, ".dark")),
  };
  const TESTI = [
    "foreground-2",
    "data-gold",
    "data-oil",
    "data-idx",
    "data-cross",
    "data-w20",
    "data-w15",
    "data-w10",
    "data-w5",
    "data-w2",
  ];
  for (const [tema, t] of Object.entries(TEMI)) {
    for (const nome of TESTI) {
      it(`${nome} in tema ${tema}`, () => {
        const colore = t.get(nome);
        expect(colore, `--${nome} in ${tema}`).toBeDefined();
        for (const fondo of ["background", "card"]) {
          const ratio = contrast(colore!, t.get(fondo)!);
          expect(ratio, `--${nome} su --${fondo} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe("Listino — minimo 11px e tabelle larghe", () => {
  it("nessuna font-size in px sotto gli 11 nel CSS del listino", () => {
    const sotto = [...LISTINO.matchAll(/font-size:\s*([\d.]+)px/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < 11);
    expect(sotto).toEqual([]);
  });

  it("le tabelle da 13 colonne in su cedono il padding e fermano la prima colonna", () => {
    expect(LISTINO).toMatch(/\.ml-tab:has\(> thead th:nth-child\(13\)\) th,/);
    expect(LISTINO).toMatch(/position: sticky;\s*left: 0;/);
  });
});
