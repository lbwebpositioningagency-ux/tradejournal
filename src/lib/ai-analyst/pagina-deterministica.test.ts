import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dossierCompleto, dossierInsufficiente } from "@/lib/ai-analyst/fixtures";
import { MOTIVO_DETERMINISTICO, sintesiFallback } from "@/lib/ai-analyst/sintesi";
import { testiDeterministici } from "@/lib/ai-analyst/frasi";
import { controlloLessicaleAnalyst } from "@/lib/ai-analyst/cancelli";

/**
 * La release v1.0 è DETERMINISTICA: la pagina non chiama nessun modello
 * linguistico. Questa non è una preferenza di stile, è una proprietà che deve
 * restare vera anche fra sei mesi, quando nessuno si ricorderà più perché.
 *
 * Il modo più solido di fissarla è guardare i FILE: se la pagina non importa
 * il client del modello, non può chiamarlo, punto — non serve simulare la
 * rete. Un test sul sorgente è insolito, ma qui misura esattamente
 * l'invariante che interessa, e fallisce nel momento in cui qualcuno
 * riaccende il percorso senza volerlo.
 */

const PAGINA = join(
  process.cwd(),
  "src",
  "app",
  "(app)",
  "macro-desk",
  "ai-analyst",
  "page.tsx",
);

const sorgente = readFileSync(PAGINA, "utf8");

describe("la pagina AI Analyst non può chiamare un modello", () => {
  it("non importa il client Gemini né quello del box COT", () => {
    expect(sorgente).not.toContain("ai-analyst/gemini");
    expect(sorgente).not.toContain("cot-contesto-gemini");
    expect(sorgente).not.toMatch(/\bgeneraJsonGemini\b/);
    expect(sorgente).not.toMatch(/\bcancelloSemanticoGemini\b/);
  });

  it("non usa il percorso con le dipendenze del modello", () => {
    expect(sorgente).not.toMatch(/\bsintesiDelGiorno\b/);
    expect(sorgente).not.toMatch(/\bgeneraSintesi\b/);
  });

  it("usa il generatore deterministico, dichiarandone il motivo", () => {
    expect(sorgente).toMatch(/\bsintesiFallback\(dossier, MOTIVO_DETERMINISTICO\)/);
  });

  it("non nomina GEMINI_API_KEY: la chiave non è una dipendenza di questa pagina", () => {
    expect(sorgente).not.toContain("GEMINI_API_KEY");
  });
});

describe("la sintesi deterministica è completa quanto quella col modello", () => {
  for (const [etichetta, dossier] of [
    ["dossier pieno", dossierCompleto()],
    ["dossier insufficiente", dossierInsufficiente()],
  ] as const) {
    it(`caso ${etichetta}: nessun campo resta vuoto`, () => {
      const s = sintesiFallback(dossier, MOTIVO_DETERMINISTICO);
      expect(s.origine).toBe("fallback");
      expect(s.motivoFallback).toBe(MOTIVO_DETERMINISTICO);
      expect(s.apertura.length).toBeGreaterThanOrEqual(2);
      expect(s.cosaNonSappiamo.length).toBeGreaterThanOrEqual(3);
      expect(s.fattori).toHaveLength(dossier.fattori.length);
      for (const f of s.fattori) expect(f.oggi.length).toBeGreaterThan(20);
      expect(s.carattereAtteso).toBe(dossier.carattereAtteso);
      expect(s.confidenza).toBe(dossier.confidenza);
    });

    it(`caso ${etichetta}: il testo passa il cancello lessicale`, () => {
      const s = sintesiFallback(dossier, MOTIVO_DETERMINISTICO);
      const testo = [
        ...s.apertura,
        ...s.fattori.map((f) => f.oggi),
        ...s.cosaNonSappiamo,
        s.motivoConfidenza,
      ].join("\n");
      expect(controlloLessicaleAnalyst(testo)).toEqual([]);
    });
  }

  it("a parità di dossier la pagina dice sempre le stesse identiche parole", () => {
    const d = dossierCompleto();
    const uno = sintesiFallback(d, MOTIVO_DETERMINISTICO);
    const due = sintesiFallback(d, MOTIVO_DETERMINISTICO);
    expect(JSON.stringify(uno)).toBe(JSON.stringify(due));
    // …e sono esattamente i template, senza intermediari.
    expect(uno.apertura).toEqual(testiDeterministici(d).apertura);
  });
});
