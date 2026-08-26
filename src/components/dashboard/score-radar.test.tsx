import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ScoreRadar } from "./score-radar";
import {
  radarScore,
  SCORE_FACTOR_INFO,
  SCORE_FACTOR_KEYS,
  SCORE_FACTOR_LABELS,
  type RadarScoreInput,
} from "@/lib/metrics";

/**
 * Rendering statico come per gli altri componenti (nessun DOM).
 *
 * Il contenuto del popover NON compare nel markup — Radix lo monta solo
 * all'apertura — quindi qui si verifica ciò che decide se il tooltip è
 * RAGGIUNGIBILE: che accanto a ogni etichetta ci sia un <button> vero (il
 * popover si apre al click/tap, non in hover: su touch un <title> SVG o un
 * `:hover` non si aprirebbero mai) e che le etichette siano uscite
 * dall'SVG, dove un bottone non potrebbe stare. Il testo delle spiegazioni
 * è coperto dai test di score.ts.
 */

const input: RadarScoreInput = {
  total: 100,
  wins: 55,
  losses: 45,
  winSum: "9000.00",
  lossSum: "-4500.00",
  ulcer: "0.0400",
  plannedTrades: 70,
  tradesWithAnyPlan: 70,
  daily: [{ netPnl: "3000.00" }, { netPnl: "2000.00" }, { netPnl: "-500.00" }],
};

function render(result = radarScore(input)) {
  return renderToStaticMarkup(<ScoreRadar result={result} />);
}

describe("ScoreRadar — icona (i) per ogni fattore", () => {
  it("ogni etichetta ha il suo bottone informativo, apribile al tocco", () => {
    const markup = render();
    for (const key of SCORE_FACTOR_KEYS) {
      expect(markup).toContain(SCORE_FACTOR_LABELS[key]);
      expect(markup).toContain(`Cos&#x27;è ${SCORE_FACTOR_INFO[key].label}?`);
    }
    // Dodici bottoni: icona (i) + trigger del tooltip sul pallino, per asse
    // (quello del titolo card sta altrove).
    expect(markup.match(/<button/g)).toHaveLength(SCORE_FACTOR_KEYS.length * 2);
  });

  it("ogni pallino ha il trigger del tooltip col valore 0-100 del fattore", () => {
    const result = radarScore(input);
    const markup = render(result);
    // L'aria-label del trigger è anche il testo del tooltip: stesso valore
    // `factors[key]` che posiziona il pallino, arrotondato all'intero.
    for (const key of SCORE_FACTOR_KEYS) {
      const value = Math.round(result!.factors[key] ?? 0).toLocaleString("it-IT");
      expect(markup).toContain(
        `${SCORE_FACTOR_LABELS[key]}: ${value}/100`,
      );
    }
  });

  it("le etichette sono HTML in overlay, non <text> dentro l'SVG", () => {
    const markup = render();
    // Un <button> dentro l'SVG richiederebbe <foreignObject>: le etichette
    // devono essere uscite dal disegno.
    expect(markup).not.toContain("<text");
    expect(markup).not.toContain("foreignObject");
    expect(markup).toContain("absolute");
  });

  it("l'icona del fattore è la stessa del titolo, in taglia ridotta", () => {
    const markup = render();
    // Variante "sm": bottone size-5 + icona size-3 (attenzione: `size-3.5`
    // esiste nel componente per l'indicatore della barra, quindi la
    // lookahead esclude i decimali). La taglia piena del titolo card
    // (size-6 / size-3.5 sull'icona) non deve comparire qui.
    expect(markup.match(/size-5/g)).toHaveLength(SCORE_FACTOR_KEYS.length);
    expect(markup.match(/size-3(?![.\d])/g)).toHaveLength(
      SCORE_FACTOR_KEYS.length,
    );
    expect(markup).not.toContain("size-6");
  });

  it("ogni etichetta è ancorata al proprio vertice e cresce verso l'esterno", () => {
    const markup = render();
    // Dodici posizioni assolute (6 trigger dei pallini + 6 etichette), tutte
    // dentro il riquadro del viewBox. `left` + `top` insieme = un ancoraggio
    // (l'indicatore della barra dello score ha il solo `left` e non va
    // contato).
    const lefts = [
      ...markup.matchAll(/left:\s*([\d.]+)%;\s*top:\s*([\d.]+)%/g),
    ].map((m) => Number(m[1]));
    expect(lefts).toHaveLength(SCORE_FACTOR_KEYS.length * 2);
    for (const left of lefts) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(100);
    }
    // Gli assi di sinistra invertono la riga così il badge resta all'esterno.
    expect(markup).toContain("flex-row-reverse");
    expect(markup).toContain("translate(-100%, -50%)");
    expect(markup).toContain("translate(-50%, -50%)");
  });

  it("senza risultato mostra comunque le sei etichette con le loro icone", () => {
    const markup = render(null);
    expect(markup.match(/<button/g)).toHaveLength(SCORE_FACTOR_KEYS.length);
    expect(markup).toContain("Disciplina");
  });
});
