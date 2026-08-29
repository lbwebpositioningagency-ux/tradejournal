import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RADAR_COLLAUDO_2026_08_23 } from "@/lib/macro-radar.fixture";
import { righeDaPayload } from "@/lib/macro-radar";
import { listaRadar } from "@/lib/macro-radar-news";
import { radarReportSchema } from "@/lib/validations/macro-radar";
import type { RadarReportCompleto } from "@/lib/queries/macro-radar";
import { RadarMaiArrivato, RadarView } from "./radar-view";

/**
 * Rendering del Radar senza DOM (renderToStaticMarkup), come per il pannello
 * COT e il termometro.
 *
 * Dal 29/08/2026 il Radar RIUSA `NewsCard`: quello che qui si verifica non è
 * più un impaginato proprio, ma che la mappatura verso quel componente non
 * perda niente e non duplichi niente. In particolare la DEDUPLICA di `top[]`,
 * che era la trappola: quelle voci non sono voci in più, sono le stesse di
 * `items[]` che hanno un'azione conseguente.
 */

function reportDa(payload: unknown): RadarReportCompleto {
  const esito = radarReportSchema.safeParse(payload);
  if (!esito.success) {
    throw new Error(esito.error.issues.map((i) => i.message).join(" | "));
  }
  const righe = righeDaPayload(esito.data);
  const conId = <T,>(voci: T[], p: string) =>
    voci.map((v, i) => ({ ...v, id: `${p}-${i}`, reportId: "rep" }));

  return {
    id: "rep",
    ...righe.report,
    payload: {},
    createdAt: new Date("2026-08-27T15:31:00Z"),
    updatedAt: new Date("2026-08-27T15:31:00Z"),
    highlights: conId(righe.highlights, "h"),
    changes: conId(righe.changes, "c"),
    readings: conId(righe.readings, "r"),
    watches: conId(righe.watches, "w"),
    emptyAreas: conId(righe.emptyAreas, "e"),
    unverifiable: conId(righe.unverifiable, "u"),
  } as unknown as RadarReportCompleto;
}

function collaudo(modifiche: Record<string, unknown> = {}): RadarReportCompleto {
  return reportDa({
    ...(JSON.parse(JSON.stringify(RADAR_COLLAUDO_2026_08_23)) as Record<string, unknown>),
    ...modifiche,
  });
}

function rendi(report: RadarReportCompleto): string {
  return renderToStaticMarkup(
    <RadarView
      report={report}
      settimane={[{ weekOf: "2026-08-23", voci: 4 }]}
      weekOfCorrente="2026-08-23"
    />,
  );
}

/** Quante volte una stringa compare nel markup. */
function quante(html: string, ago: string): number {
  return html.split(ago).length - 1;
}

// ═══════════════════ 1 — la deduplica di top[] ═══════════════════

describe("RadarView — top[] non aggiunge voci, aggiunge azioni", () => {
  const report = collaudo();
  const html = rendi(report);
  const lista = listaRadar(report);

  it("il payload del 27/08 rende QUATTRO schede, non sei", () => {
    const voci = lista.gruppi.reduce((n, g) => n + g.items.length, 0);
    expect(voci).toBe(4);
    // Due delle quattro sono in `top[]`: se il merge non fosse avvenuto ne
    // uscirebbero sei.
    expect(report.highlights).toHaveLength(2);
  });

  it("nessuna evidenza resta orfana", () => {
    expect(lista.orfane).toEqual([]);
  });

  it("i titoli di top[] non compaiono: valgono quelli del registro", () => {
    expect(html).not.toContain("CME lancia gli E-nano");
    expect(html).not.toContain("FTMO aggiunge TradingView");
    expect(quante(html, "listing dei futures E-nano")).toBe(1);
  });

  it("l'azione conseguente compare UNA volta, dentro l'approfondimento", () => {
    expect(quante(html, "Verificare con il broker")).toBe(1);
    expect(quante(html, "Cosa fare: ")).toBe(2);
  });

  it("ogni cambiamento dichiara la sua entrata in vigore, anche quando manca", () => {
    // Quattro cambiamenti, quattro righe: tre con una data, una che dice a
    // voce alta di non averla. Il silenzio si leggerebbe «già in vigore».
    expect(quante(html, "In vigore dal: ")).toBe(4);
    expect(quante(html, "In vigore dal: non ancora dichiarata")).toBe(1);
  });

  it("una voce senza evidenza non porta nessuna nota operativa", () => {
    const senza = rendi(collaudo({ top: [] }));
    expect(senza).not.toContain("Cosa fare: ");
    // …ma le quattro voci restano tutte.
    expect(senza).toContain("listing dei futures E-nano");
    expect(senza).toContain("alert su rettangolo");
  });
});

// ═══════════════════ 2 — la forma è quella di News ═══════════════════

describe("RadarView — riusa la scheda News, non ne inventa una", () => {
  const html = rendi(collaudo());

  it("ogni voce con testo esteso ha il comando «Approfondimento»", () => {
    expect(quante(html, "Approfondimento")).toBe(4);
  });

  it("il titolo è un link alla fonte, come nella sezione News", () => {
    expect(html).toContain(
      'href="https://www.cmegroup.com/notices/ser/2026/08/ser-9789.html"',
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("non reintroduce gli elementi che la sezione News non ha", () => {
    // Nessuna tabella, nessun chip mono di stato, nessuno spillo.
    expect(html).not.toContain("<table");
    expect(html).not.toContain("annunciato</span>");
    expect(html).not.toContain("In evidenza");
  });

  it("l'ente della fonte è il chip in testa alla scheda", () => {
    expect(html).toContain("CME Group");
    expect(html).toContain("FTMO");
    // Il nome completo della circolare NON sta nel chip: sarebbe una riga da
    // cinquanta caratteri.
    expect(html).not.toContain("Special Executive Report SER-9789 (24 ago 2026)");
  });
});

// ═══════════════════ 3 — i gruppi ═══════════════════

describe("RadarView — le aree sono i gruppi, nell'ordine A-G", () => {
  const report = collaudo();
  const html = rendi(report);
  const lista = listaRadar(report);

  it("un gruppo per area con voci, e nessun gruppo vuoto", () => {
    expect(lista.gruppi.map((g) => g.label)).toEqual([
      "Prop firm",
      "Borse",
      "Piattaforme",
    ]);
  });

  it("le aree si chiamano per nome, mai con la lettera", () => {
    for (const parola of ["Prop firm", "Borse", "Piattaforme"]) {
      expect(html).toContain(parola);
    }
    expect(html).not.toContain(">B<");
  });

  it("dentro un gruppo le voci scendono per data d'annuncio", () => {
    const piattaforme = lista.gruppi.find((g) => g.label === "Piattaforme");
    expect(piattaforme?.items.map((i) => i.when)).toEqual([
      "2026-08-21",
      "2026-08-14",
    ]);
  });

  it("una voce senza area finisce in fondo, nel gruppo «Altro»", () => {
    const conWatch = collaudo({
      watchlist: [
        {
          id: "osservazione-senza-area",
          title: "Annuncio senza data di efficacia",
          note: "In attesa di una data.",
        },
      ],
    });
    const gruppi = listaRadar(conWatch).gruppi;
    expect(gruppi.at(-1)?.label).toBe("Altro");
    expect(gruppi.at(-1)?.items).toHaveLength(1);
  });
});

// ═══════════════════ 4 — la copertura delle fonti ═══════════════════

describe("RadarView — le due righe in fondo", () => {
  it("elenca le aree vuote e quelle non lette, senza il motivo", () => {
    const html = rendi(collaudo());
    // `emptyAreas` del run vero è ["D", "G"] — Regole e Ricerca.
    expect(html).toContain("Aree guardate senza novità: Regole, Ricerca.");
    expect(html).toContain(
      "Non è stato possibile leggere l&#x27;elenco completo di: Borse, Broker, Dati.",
    );
    // Il `reason` resta nelle note del run, non in questa riga.
    expect(html).not.toContain("non espone l&#x27;elenco; documento raggiunto");
  });

  it("se tutte le aree sono state lette, la riga non compare", () => {
    const html = rendi(
      collaudo({ emptyAreas: ["C", "D", "F", "G"], unverifiableAreas: [] }),
    );
    expect(html).not.toContain("Non è stato possibile leggere");
    expect(html).toContain("Aree guardate senza novità:");
  });

  it("la griglia delle sette aree e la legenda in prosa non esistono più", () => {
    const html = rendi(collaudo());
    expect(html).not.toContain("Le sette aree");
    expect(html).not.toContain("fonte non letta");
    expect(html).not.toContain("non dichiarata");
    expect(html).not.toContain("In osservazione");
    expect(html).not.toContain("Letture");
  });
});

// ═══════════════════ 5 — quante voci sono, il layout regge ═══════════════════

describe("RadarView — il numero di voci è variabile", () => {
  it("una voce sola: nessun gruppo vuoto, nessun buco", () => {
    const payload = JSON.parse(
      JSON.stringify(RADAR_COLLAUDO_2026_08_23),
    ) as Record<string, unknown>;
    const items = (payload.items as unknown[]).slice(0, 1);
    const html = rendi(
      collaudo({
        items,
        top: [],
        // Le altre sei aree vanno dichiarate, o lo schema rifiuta il payload.
        emptyAreas: ["A", "C", "D", "E", "F", "G"],
        unverifiableAreas: [],
      }),
    );
    expect(quante(html, "Approfondimento")).toBe(1);
    expect(html).toContain("Borse");
    expect(html).not.toContain("Piattaforme</h3>");
  });

  it("nessuna voce: lo stato vuoto della sezione, non una pagina muta", () => {
    const html = rendi(
      collaudo({
        items: [],
        top: [],
        emptyAreas: ["A", "B", "C", "D", "E", "F", "G"],
        unverifiableAreas: [],
      }),
    );
    expect(html).toContain("Registro della settimana non disponibile");
  });
});

// ═══════════════════ 6 — nessun registro ═══════════════════

describe("RadarMaiArrivato", () => {
  it("dice che non è mai arrivato niente, non che non è cambiato niente", () => {
    const html = renderToStaticMarkup(<RadarMaiArrivato />);
    expect(html).toContain("Nessun registro ancora");
    expect(html).toContain("non perché non sia cambiato niente");
  });
});
