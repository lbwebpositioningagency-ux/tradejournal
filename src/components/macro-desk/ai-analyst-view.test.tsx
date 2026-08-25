import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiAnalystView } from "./ai-analyst-view";
import { controlloLessicaleAnalyst } from "@/lib/ai-analyst/cancelli";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import {
  GIORNO_FIXTURE,
  dossierCompleto,
  dossierInsufficiente,
  lettureComplete,
  ivArchivioFixture,
  termometroFixture,
} from "@/lib/ai-analyst/fixtures";
import { AI_ANALYST_INSTRUMENTS } from "@/lib/ai-analyst/instruments";
import { LIMITI_FISSI } from "@/lib/ai-analyst/frasi";
import { sintesiFallback, type SintesiAiAnalyst } from "@/lib/ai-analyst/sintesi";
import { letturaAssente, letturaOk } from "@/lib/ai-analyst/types";
import type { Dossier } from "@/lib/ai-analyst/types";

/**
 * Test sul MARKUP RESO, sul modello di quelli già usati per il pannello COT e
 * per i tab del report: quello che conta è ciò che finisce a schermo, non
 * quello che il modulo si propone di fare.
 */

function rendi(sintesi: SintesiAiAnalyst): string {
  return renderToStaticMarkup(
    <AiAnalystView sintesi={sintesi} strumento={sintesi.strumento} />,
  );
}

function sintesiDi(d: Dossier): SintesiAiAnalyst {
  return sintesiFallback(d, "prova");
}

/** Solo il testo, senza tag e senza attributi: è ciò che l'utente legge. */
function testoVisibile(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/* ── il vincolo che conta ────────────────────────────────────────────── */

describe("nessun linguaggio direzionale nel testo reso", () => {
  const casi: { etichetta: string; dossier: Dossier }[] = [
    ...AI_ANALYST_INSTRUMENTS.map((s) => ({
      etichetta: `${s} completo`,
      dossier: dossierCompleto(s),
    })),
    ...AI_ANALYST_INSTRUMENTS.map((s) => ({
      etichetta: `${s} senza dati`,
      dossier: dossierInsufficiente(s),
    })),
    {
      etichetta: "stato compresso",
      dossier: buildDossier(
        "ORO",
        GIORNO_FIXTURE,
        lettureComplete(GIORNO_FIXTURE, termometroFixture("COMPRESSA"), {
          ivArchivio: ivArchivioFixture(6),
        }),
      ),
    },
    {
      etichetta: "con misure mancanti e dati vecchi",
      dossier: (() => {
        const r = lettureComplete();
        r.stabilita = letturaAssente("campione_insufficiente");
        r.cotPartecipazione = letturaAssente("fonte_non_disponibile");
        return buildDossier("ORO", GIORNO_FIXTURE, r);
      })(),
    },
  ];

  for (const { etichetta, dossier } of casi) {
    it(`caso: ${etichetta}`, () => {
      const testo = testoVisibile(rendi(sintesiDi(dossier)));
      expect(controlloLessicaleAnalyst(testo)).toEqual([]);
    });
  }

  it("non usa frecce direzionali", () => {
    for (const { dossier } of casi) {
      const html = rendi(sintesiDi(dossier));
      expect(html).not.toContain("↑");
      expect(html).not.toContain("↓");
      expect(html).not.toContain("▲");
      expect(html).not.toContain("▼");
    }
  });

  it("non usa il verde e il rosso del P&L come giudizio", () => {
    for (const { dossier } of casi) {
      const html = rendi(sintesiDi(dossier));
      expect(html).not.toContain("--md-up");
      expect(html).not.toContain("--md-down");
      expect(html).not.toContain("text-profit");
      expect(html).not.toContain("text-loss");
    }
  });
});

/* ── blocco dei limiti ───────────────────────────────────────────────── */

describe("il blocco «cosa questa lettura non dice»", () => {
  it("c'è sempre, in ogni caso, e non è mai vuoto", () => {
    for (const dossier of [
      dossierCompleto(),
      dossierCompleto("DAX"),
      dossierInsufficiente(),
    ]) {
      const html = rendi(sintesiDi(dossier));
      expect(html).toContain("Cosa questa lettura non dice");
      for (const fisso of LIMITI_FISSI) {
        expect(testoVisibile(html)).toContain(fisso);
      }
    }
  });

  it("rimette i limiti fissi se la sintesi arrivasse con la lista vuota", () => {
    // Difesa contro una regressione a monte: la sezione non deve mai mostrare
    // l'intestazione dei limiti senza limiti sotto.
    const s = { ...sintesiDi(dossierCompleto()), cosaNonSappiamo: [] };
    const testo = testoVisibile(rendi(s));
    expect(testo).toContain("Cosa questa lettura non dice");
    for (const fisso of LIMITI_FISSI) expect(testo).toContain(fisso);
  });
});

/* ── dati insufficienti ──────────────────────────────────────────────── */

describe("stato di dati insufficienti", () => {
  const html = rendi(sintesiDi(dossierInsufficiente()));

  it("è reso, ed è la prima cosa dopo i selettori", () => {
    expect(html).toContain("Dati insufficienti");
    const avviso = html.indexOf("Dati insufficienti");
    const verdetto = html.indexOf("Carattere della giornata");
    const limiti = html.indexOf("Cosa questa lettura non dice");
    expect(avviso).toBeGreaterThan(-1);
    expect(avviso).toBeLessThan(verdetto);
    expect(avviso).toBeLessThan(limiti);
  });

  it("dichiara indeterminato invece di inventare un carattere", () => {
    expect(testoVisibile(html)).toContain("Indeterminato");
    expect(testoVisibile(html)).toContain("nessuna");
  });

  it("non compare quando i dati bastano", () => {
    expect(rendi(sintesiDi(dossierCompleto()))).not.toContain(
      "Dati insufficienti",
    );
  });

  it("dice quali sezioni non hanno dato niente invece di tacere", () => {
    expect(testoVisibile(html)).toContain(
      "Nessuna sezione del Macro Desk ha fornito un dato utilizzabile",
    );
  });
});

/* ── provenienza e freschezza ────────────────────────────────────────── */

describe("provenienza e freschezza, sempre a schermo", () => {
  it("mostra la data del dato più vecchio e le sezioni lette", () => {
    const d = dossierCompleto();
    const html = rendi(sintesiDi(d));
    const testo = testoVisibile(html);
    expect(testo).toContain("Dato più vecchio usato");
    expect(testo).toContain("04/08/2026");
    for (const f of d.fonti) expect(testo).toContain(f.sezione);
  });

  it("segnala il dato che non è dell'ultima seduta accanto al fattore", () => {
    const r = lettureComplete();
    r.cotPartecipazione = letturaOk(
      r.cotPartecipazione.ok ? r.cotPartecipazione.valore : ({} as never),
      "2026-07-20",
    );
    const d = buildDossier("ORO", GIORNO_FIXTURE, r);
    const testo = testoVisibile(rendi(sintesiDi(d)));
    expect(testo).toContain("non è dell'ultima seduta");
    expect(testo).toContain("20/07/2026");
  });

  it("dichiara quando il testo è stato scritto senza modello", () => {
    const testo = testoVisibile(rendi(sintesiDi(dossierCompleto())));
    expect(testo).toContain("senza modello linguistico");
  });

  it("dichiara quando il testo viene dal modello", () => {
    const s: SintesiAiAnalyst = {
      ...sintesiDi(dossierCompleto()),
      origine: "modello",
      motivoFallback: null,
    };
    const testo = testoVisibile(rendi(s));
    expect(testo).toContain("due controlli automatici");
  });
});

/* ── selettore ───────────────────────────────────────────────────────── */

describe("selettore degli strumenti", () => {
  it("elenca tutti e quattro gli strumenti e marca quello corrente", () => {
    const html = rendi(sintesiDi(dossierCompleto("WTI")));
    for (const code of AI_ANALYST_INSTRUMENTS) {
      expect(html).toContain(`/macro-desk/ai-analyst?s=${code}`);
    }
    expect(html).toContain('aria-current="true"');
  });
});

/* ── fattori ─────────────────────────────────────────────────────────── */

describe("elenco dei fattori", () => {
  it("una voce per fattore, con nome, peso in parole e data", () => {
    const d = dossierCompleto();
    const testo = testoVisibile(rendi(sintesiDi(d)));
    for (const f of d.fattori) expect(testo).toContain(f.nome);
    expect(testo).toContain("pesa molto");
    expect(testo).toContain("sfondo");
  });

  it("elenca i fattori mancanti col motivo, invece di ometterli", () => {
    const r = lettureComplete();
    r.stabilita = letturaAssente("campione_insufficiente");
    const d = buildDossier("ORO", GIORNO_FIXTURE, r);
    const testo = testoVisibile(rendi(sintesiDi(d)));
    expect(testo).toContain("Cosa non c'era");
    expect(testo).toContain("campione storico troppo piccolo");
  });

  it("sul DAX dichiara ciò che per quello strumento non esiste", () => {
    const testo = testoVisibile(rendi(sintesiDi(dossierCompleto("DAX"))));
    expect(testo).toContain("non esiste per questo strumento");
  });
});
