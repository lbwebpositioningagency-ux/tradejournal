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

/* oklch → OKLab, e luminanza da OKLab: `color-mix(in oklab, …)` interpola qui. */
function oklab(value: string): [number, number, number] {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`Non oklch: ${value}`);
  const h = (Number(m[3]) * Math.PI) / 180;
  return [Number(m[1]), Number(m[2]) * Math.cos(h), Number(m[2]) * Math.sin(h)];
}
function luminanceLab([L, a, b]: [number, number, number]): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return (
    0.2126 * clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s) +
    0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s) +
    0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s)
  );
}

describe("Griglia anni × periodo — heatmap tenue: colori e dosi dal sistema", () => {
  const regole = [...LISTINO.matchAll(/((?:\.ml-griglia|:is\(\.ml-griglia|\.ml-scala)[^{]*)\{([^}]*)\}/g)].map((m) => ({
    selettore: m[1].trim(),
    corpo: m[2],
  }));
  const corpo = (frammento: string) => regole.find((r) => r.selettore.includes(frammento))?.corpo ?? "";
  const TEMI = {
    chiaro: tokens(block(GLOBALS, ":root")),
    scuro: tokens(block(GLOBALS, ".dark")),
  };
  /* Colori del segno effettivi per coppia: le varianti daltoniche li ridefiniscono. */
  const COPPIE = {
    chiaro: [TEMI.chiaro, tokens(block(GLOBALS, '[data-pnl="blue-red"]')), tokens(block(GLOBALS, '[data-pnl="green-violet"]'))],
    scuro: [
      TEMI.scuro,
      tokens(block(GLOBALS, ':where(.dark, .dark *)[data-pnl="blue-red"]')),
      tokens(block(GLOBALS, ':where(.dark, .dark *)[data-pnl="green-violet"]')),
    ],
  };

  it("nessun colore scritto a mano nelle regole della griglia e della legenda", () => {
    expect(regole.length).toBeGreaterThanOrEqual(20);
    for (const { selettore, corpo: c } of regole) {
      expect(c, selettore).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i);
    }
  });

  it("il fondo è il colore del segno dosato dal token del passo, sopra la card", () => {
    expect(corpo(").ml-su")).toMatch(/--ml-segno:\s*var\(--md-up\)/);
    expect(corpo(").ml-giu")).toMatch(/--ml-segno:\s*var\(--md-down\)/);
    for (let p = 1; p <= 5; p++) {
      const c = corpo(`[data-calore="${p}"]`);
      expect(c, `passo ${p}`).toMatch(
        new RegExp(`background-color:\\s*color-mix\\(in oklab, var\\(--ml-segno\\) var\\(--ml-heat-${p}\\), var\\(--md-bg\\)\\)`),
      );
      if (p >= 4) expect(c, `passo ${p}`).toMatch(/color:\s*var\(--md-text\)/);
      else expect(c, `passo ${p}`).not.toMatch(/(^|[^-])color:/);
    }
  });

  for (const [tema, t] of Object.entries(TEMI)) {
    it(`le dosi --heat-1…5 sono token del sistema, crescenti e tenui, in tema ${tema}`, () => {
      const dosi = [1, 2, 3, 4, 5].map((p) => Number(t.get(`heat-${p}`)?.replace("%", "")));
      for (const d of dosi) expect(Number.isFinite(d)).toBe(true);
      for (let i = 1; i < 5; i++) expect(dosi[i]).toBeGreaterThan(dosi[i - 1]);
      expect(dosi[4]).toBeLessThanOrEqual(40);
    });

    it(`cifre ≥ 4,5:1 su ogni passo, con le tre coppie di colori, in tema ${tema}`, () => {
      const card = oklab(t.get("card")!);
      for (const coppia of COPPIE[tema as keyof typeof COPPIE]) {
        for (const segno of ["profit", "loss"]) {
          const colore = oklab(coppia.get(segno) ?? t.get(segno)!);
          for (let p = 1; p <= 5; p++) {
            const dose = Number(t.get(`heat-${p}`)!.replace("%", "")) / 100;
            const fondo = colore.map((v, i) => v * dose + card[i] * (1 - dose)) as [number, number, number];
            const testo = p >= 4 ? "foreground" : "foreground-2";
            const [x, y] = [luminanceLab(oklab(t.get(testo)!)), luminanceLab(fondo)].sort((a, b) => b - a);
            const ratio = (x + 0.05) / (y + 0.05);
            expect(ratio, `--${testo} su ${segno} al passo ${p} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });

    it(`anno in corso e fascia di sintesi ≥ 4,5:1 in tema ${tema}`, () => {
      for (const testo of ["foreground-2", "muted-foreground"]) {
        const ratio = contrast(t.get(testo)!, t.get("track")!);
        expect(ratio, `--${testo} su --track = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
      const fascia = contrast(t.get("foreground-2")!, t.get("muted")!);
      expect(fascia, `--foreground-2 su --muted = ${fascia.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
