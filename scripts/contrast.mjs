/**
 * Validatore contrasti WCAG per i token OKLCH del tema.
 *
 * Regola del progetto: i contrasti si CALCOLANO, non si stimano a occhio.
 * Questo script converte OKLCH → sRGB (con gamma e clamp di gamut) e calcola
 * il rapporto di contrasto WCAG 2.1 fra le coppie che contano davvero:
 * testo su sfondo, testo su card, colori P&L su entrambe le superfici,
 * foreground dei bottoni primari.
 *
 * Uso:
 *   node scripts/contrast.mjs                 # report della palette in esame
 *   node scripts/contrast.mjs --sweep <H> <modo>  # migliori (L, C) per una tinta
 *   node scripts/contrast.mjs --solve <L> <H> # massima chroma che regge AA
 *
 * Zero dipendenze npm: la conversione è ~40 righe di matrici.
 *
 * NOTA: qui si ESPLORA la palette (solver e sweep). La verifica che i token
 * scritti davvero in globals.css reggano AA e stiano in gamut è un TEST
 * (src/lib/theme-contrast.test.ts), che legge il CSS: unica fonte di verità.
 */

// ── OKLCH → sRGB ────────────────────────────────────────────────────────
function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function gamma(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** True se il colore esce dal gamut sRGB (verrebbe clampato dal browser). */
export function outOfGamut(L, C, H) {
  return oklchToLinearSrgb(L, C, H).some((v) => v < -0.0005 || v > 1.0005);
}

export function oklchToSrgb(L, C, H) {
  return oklchToLinearSrgb(L, C, H).map((v) => Math.min(1, Math.max(0, gamma(v))));
}

/** Luminanza relativa WCAG dal valore sRGB (0-1). */
function relativeLuminance([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(colorA, colorB) {
  const la = relativeLuminance(oklchToSrgb(...colorA));
  const lb = relativeLuminance(oklchToSrgb(...colorB));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function hex(L, C, H) {
  return (
    "#" +
    oklchToSrgb(L, C, H)
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Massima chroma che, a L e H dati, mantiene il contrasto richiesto contro
 * TUTTE le superfici indicate restando dentro il gamut sRGB.
 * Ricerca a passo fine: non "il primo valore che passa", il massimo.
 */
export function maxChroma(L, H, surfaces, min = 4.5) {
  let best = 0;
  for (let C = 0; C <= 0.42; C += 0.001) {
    if (outOfGamut(L, C, H)) break;
    const ok = surfaces.every((s) => contrast([L, C, H], s) >= min);
    if (ok) best = C;
  }
  return Number(best.toFixed(3));
}

// ── Palette in verifica ─────────────────────────────────────────────────
const PALETTE = {
  light: {
    background: [0.988, 0.003, 264],
    card: [1, 0, 0],
    foreground: [0.16, 0.014, 264],
    muted: [0.532, 0.019, 264],
    primary: [0.54, 0.251, 262],
    primaryFg: [0.988, 0.003, 264],
    profit: [0.525, 0.123, 158],
    loss: [0.565, 0.23, 26],
    breakeven: [0.44, 0.012, 264],
  },
  dark: {
    background: [0.145, 0.012, 264],
    card: [0.204, 0.015, 264],
    foreground: [0.975, 0.004, 264],
    muted: [0.714, 0.021, 264],
    primary: [0.635, 0.194, 262],
    primaryFg: [0.145, 0.012, 264],
    profit: [0.75, 0.175, 158],
    loss: [0.655, 0.228, 26],
    breakeven: [0.714, 0.015, 264],
  },
};

function report() {
  let failures = 0;
  for (const [mode, p] of Object.entries(PALETTE)) {
    console.log(`\n── ${mode.toUpperCase()} ──`);
    const surfaces = [
      ["bg", p.background],
      ["card", p.card],
    ];
    const checks = [
      ["foreground", p.foreground, 4.5],
      ["muted-foreground", p.muted, 4.5],
      ["profit", p.profit, 4.5],
      ["loss", p.loss, 4.5],
      ["breakeven", p.breakeven, 4.5],
      ["primary (come testo)", p.primary, 4.5],
    ];
    for (const [name, color, min] of checks) {
      const results = surfaces.map(
        ([sName, s]) => [sName, contrast(color, s)],
      );
      const worst = Math.min(...results.map(([, v]) => v));
      const ok = worst >= min;
      if (!ok) failures++;
      console.log(
        `${ok ? "✅" : "❌"} ${name.padEnd(22)} ${hex(...color)}  ` +
          results.map(([n, v]) => `${n} ${v.toFixed(2)}`).join(" · ") +
          (outOfGamut(...color) ? "  ⚠ FUORI GAMUT" : ""),
      );
    }
    const btn = contrast(p.primaryFg, p.primary);
    const okBtn = btn >= 4.5;
    if (!okBtn) failures++;
    console.log(
      `${okBtn ? "✅" : "❌"} ${"testo su bottone primario".padEnd(22)} ${btn.toFixed(2)}`,
    );
  }

  console.log(
    failures === 0
      ? "\nTutte le coppie passano WCAG AA (≥4.5:1).\n"
      : `\n${failures} coppie SOTTO soglia.\n`,
  );
  return failures;
}

/**
 * Scansione 2D (L × C) per una tinta: per ogni luminosità riporta la chroma
 * massima in gamut che regge il contrasto su ENTRAMBE le superfici del modo.
 * Serve a scegliere il punto più vivido possibile, non il primo accettabile.
 */
function sweep(H, mode, min = 4.5) {
  const p = PALETTE[mode];
  const surfaces = [p.background, p.card];
  const rows = [];
  for (let L = 0.34; L <= 0.84; L += 0.005) {
    const C = maxChroma(Number(L.toFixed(3)), H, surfaces, min);
    if (C > 0) rows.push({ L: Number(L.toFixed(3)), C });
  }
  rows.sort((a, b) => b.C - a.C);
  return rows.slice(0, 6);
}

// Eseguito come script, non come import (altrimenti chi importa le utility
// si ritroverebbe il report stampato).
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/contrast.mjs");

if (!isMain) {
  // solo esportazioni
} else if (process.argv.includes("--sweep")) {
  const args = process.argv.slice(process.argv.indexOf("--sweep") + 1);
  const H = Number(args[0]);
  const mode = args[1] ?? "light";
  console.log(`tinta ${H}° · modo ${mode} — migliori (L, C):`);
  for (const r of sweep(H, mode)) {
    console.log(
      `  L ${r.L.toFixed(3)}  C ${r.C.toFixed(3)}  ${hex(r.L, r.C, H)}  ` +
        `contrasto bg ${contrast([r.L, r.C, H], PALETTE[mode].background).toFixed(2)} · ` +
        `card ${contrast([r.L, r.C, H], PALETTE[mode].card).toFixed(2)}`,
    );
  }
} else if (process.argv.includes("--solve")) {
  const [L, H] = process.argv.slice(process.argv.indexOf("--solve") + 1).map(Number);
  const light = [PALETTE.light.background, PALETTE.light.card];
  const dark = [PALETTE.dark.background, PALETTE.dark.card];
  console.log("max chroma su superfici LIGHT:", maxChroma(L, H, light));
  console.log("max chroma su superfici DARK: ", maxChroma(L, H, dark));
} else {
  process.exitCode = report() === 0 ? 0 : 1;
}
