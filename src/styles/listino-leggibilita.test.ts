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

describe("Griglia anni × periodo — tinta piena, colori dal sistema", () => {
  const regole = [...LISTINO.matchAll(/((?:\.ml-griglia|\.ml-scala)[^{]*)\{([^}]*)\}/g)].map((m) => ({
    selettore: m[1].trim(),
    corpo: m[2],
  }));
  const corpo = (frammento: string) => regole.find((r) => r.selettore.includes(frammento))?.corpo ?? "";
  const TEMI = {
    chiaro: tokens(block(GLOBALS, ":root")),
    scuro: tokens(block(GLOBALS, ".dark")),
  };

  it("nessun colore scritto a mano nelle regole della griglia e della legenda", () => {
    expect(regole.length).toBeGreaterThanOrEqual(15);
    for (const { selettore, corpo: c } of regole) {
      expect(c, selettore).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i);
    }
  });

  it("la tinta della casella non sta nel CSS: dipende dal valore e la calcola calore.ts", () => {
    for (const { selettore, corpo: c } of regole) {
      expect(c, selettore).not.toMatch(/--md-(up|down)/);
    }
    // Quello che il CSS deve garantire è l'inchiostro sopra la tinta.
    expect(corpo("td.ml-cella")).toMatch(/color:\s*var\(--md-text\)/);
  });

  it("i token della heatmap tenue sono spariti con lei", () => {
    expect(LISTINO).not.toMatch(/--ml-heat-|data-calore/);
    // Nessuna DICHIARAZIONE delle dosi (il commento che le ricorda può restare);
    // i --heat-profit-*/--heat-loss-* delle mappe del journal sono un'altra famiglia.
    expect(GLOBALS).not.toMatch(/--heat-[1-5]:/);
  });

  it("le cifre tornano alla taglia del riferimento e la sintesi le segue", () => {
    // 14px in Geist = gli 11px di inchiostro misurati sul tag, dove il mono a
    // 12px rendeva glifi più alti di Geist alla stessa taglia.
    expect(regole.find((r) => r.selettore === ".ml-griglia")?.corpo).toMatch(/font-size:\s*14px/);
    const sintesi = regole.filter((r) => /tfoot/.test(r.selettore) && !/th:first-child/.test(r.selettore));
    expect(sintesi.length).toBeGreaterThanOrEqual(3);
    for (const r of sintesi) expect(r.corpo, r.selettore).not.toMatch(/font-size:/);
    expect(corpo("tfoot tr.ml-media > *")).toMatch(/font-weight:\s*600/);
    expect(corpo("tfoot th:first-child")).toMatch(/text-transform:\s*uppercase/);
  });

  for (const [tema, t] of Object.entries(TEMI)) {
    it(`anno in corso e caselle grigie ≥ 4,5:1 in tema ${tema}`, () => {
      for (const testo of ["foreground-2", "muted-foreground"]) {
        const ratio = contrast(t.get(testo)!, t.get("track")!);
        expect(ratio, `--${testo} su --track = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
      const grigia = contrast(t.get("muted-foreground")!, t.get("card")!);
      expect(grigia, `--muted-foreground su --card = ${grigia.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("Griglia anni × periodo — la cornice ha un fondo suo (--frame)", () => {
  const regola = (sel: string) =>
    [...LISTINO.matchAll(/(\.ml-griglia[^{]*)\{([^}]*)\}/g)].find((m) => m[1].trim() === sel)?.[2] ?? "";
  const TEMI = {
    chiaro: tokens(block(GLOBALS, ":root")),
    scuro: tokens(block(GLOBALS, ".dark")),
  };

  it("testata, colonna Anno e sintesi stanno sul fondo di cornice, con etichette in testo secondario", () => {
    expect(regola(".ml-griglia thead th")).toMatch(/background-color:\s*var\(--ml-frame\)/);
    expect(regola(".ml-griglia thead th")).toMatch(/color:\s*var\(--md-text-2\)/);
    expect(regola(".ml-griglia :is(thead, tbody, tfoot) th:first-child")).toMatch(/background-color:\s*var\(--ml-frame\)/);
    expect(regola(".ml-griglia tfoot :is(th, td)")).toMatch(/background-color:\s*var\(--ml-frame\)/);
    expect(regola(".ml-griglia tfoot th:first-child")).toMatch(/color:\s*var\(--md-text-2\)/);
    expect(LISTINO).toMatch(/--ml-frame:\s*var\(--frame\)/);
  });

  for (const [tema, t] of Object.entries(TEMI)) {
    it(`--frame si distingue dalla card e regge il testo in tema ${tema}`, () => {
      const frame = t.get("frame");
      expect(frame, `--frame in ${tema}`).toBeDefined();
      const stacco = contrast(frame!, t.get("card")!);
      expect(stacco, `--frame su --card = ${stacco.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.15);
      for (const testo of ["foreground", "foreground-2"]) {
        const ratio = contrast(t.get(testo)!, frame!);
        expect(ratio, `--${testo} su --frame = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
