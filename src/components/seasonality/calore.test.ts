import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTENSITA_MINIMA,
  OPACITA_MAX,
  OPACITA_MIN,
  fondoCella,
  intensitaCella,
  scalaRobusta,
  scartoDi,
} from "./calore";

describe("scalaRobusta", () => {
  it("è il 90° percentile dello scarto assoluto, segno ignorato", () => {
    const scarti = Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : -1) * (i + 1));
    expect(scalaRobusta(scarti)).toBe(91);
  });

  it("un singolo estremo non schiaccia la griglia", () => {
    const normali = Array.from({ length: 99 }, (_, i) => (i % 10) - 5);
    const scala = scalaRobusta([...normali, 500]);
    expect(scala).toBeLessThan(10);
    // Con il massimo come scala, una casella da 4 varrebbe l'1% di intensità.
    expect(intensitaCella(4, scala)).toBeGreaterThan(0.5);
  });

  it("nessun valore o tutti zero: nessuna casella si tinge", () => {
    expect(scalaRobusta([])).toBe(0);
    expect(scalaRobusta([0, 0, 0])).toBe(0);
    expect(fondoCella(3, 0)).toBeUndefined();
  });
});

describe("fondoCella", () => {
  it("tinta piena al colore del segno, proporzionale e con i due tetti", () => {
    expect(fondoCella(10, 10)).toBe(`color-mix(in oklab, var(--md-up) ${OPACITA_MAX}%, var(--md-bg))`);
    expect(fondoCella(-30, 10)).toBe(`color-mix(in oklab, var(--md-down) ${OPACITA_MAX}%, var(--md-bg))`);
    expect(fondoCella(0.5, 10)).toBe("color-mix(in oklab, var(--md-up) 14%, var(--md-bg))");
    expect(fondoCella(5, 10)).toBe("color-mix(in oklab, var(--md-up) 32%, var(--md-bg))");
  });

  it("sotto l'intensità minima la casella resta neutra", () => {
    expect(fondoCella(0, 10)).toBeUndefined();
    expect(fondoCella(INTENSITA_MINIMA * 10 * 0.9, 10)).toBeUndefined();
    expect(fondoCella(Number.NaN, 10)).toBeUndefined();
  });

  it("i livelli si misurano dalla mediana della finestra, i rendimenti da zero", () => {
    expect(scartoDi(24, "LEVEL", 20)).toBe(4);
    expect(scartoDi(24, "RETURN", 20)).toBe(24);
  });
});

/**
 * IL TETTO DI OPACITÀ È UN VINCOLO DI CONTRASTO, e si ricalcola dai token veri
 * di `globals.css`: se qualcuno alza il tetto o cambia un colore della palette
 * (comprese le coppie daltoniche), questo test fallisce prima che la griglia
 * diventi illeggibile. `color-mix(in oklab, …)` interpola le coordinate OKLab.
 */
describe("la cifra sopra la tinta piena regge WCAG AA", () => {
  const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");
  function blocco(selettore: string): Map<string, [number, number, number]> {
    const escaped = selettore.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`Blocco CSS non trovato: ${selettore}`);
    const out = new Map<string, [number, number, number]>();
    for (const m of match[1].matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) {
      out.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
    }
    return out;
  }
  const lab = ([L, C, h]: [number, number, number]): [number, number, number] => [
    L,
    C * Math.cos((h * Math.PI) / 180),
    C * Math.sin((h * Math.PI) / 180),
  ];
  function luminanza([L, a, b]: [number, number, number]): number {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return (
      0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
      0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
      0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
    );
  }
  const rapporto = (a: [number, number, number], b: [number, number, number]) => {
    const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const TEMI = { chiaro: blocco(":root"), scuro: blocco(".dark") };
  const COPPIE = {
    chiaro: [TEMI.chiaro, blocco('[data-pnl="blue-red"]'), blocco('[data-pnl="green-violet"]')],
    scuro: [
      TEMI.scuro,
      blocco(':where(.dark, .dark *)[data-pnl="blue-red"]'),
      blocco(':where(.dark, .dark *)[data-pnl="green-violet"]'),
    ],
  };

  for (const [tema, t] of Object.entries(TEMI)) {
    it(`tema ${tema}: --foreground ≥ 4,5:1 fino al tetto, con tutte le coppie`, () => {
      const card = lab(t.get("card")!);
      const testo = lab(t.get("foreground")!);
      for (const coppia of COPPIE[tema as keyof typeof COPPIE]) {
        for (const segno of ["profit", "loss"]) {
          const colore = lab(coppia.get(segno) ?? t.get(segno)!);
          for (const pct of [OPACITA_MIN, 30, OPACITA_MAX]) {
            const p = pct / 100;
            const fondo = colore.map((v, i) => v * p + card[i] * (1 - p)) as [number, number, number];
            const r = rapporto(testo, fondo);
            expect(r, `${segno} al ${pct}% in ${tema} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });
  }
});
