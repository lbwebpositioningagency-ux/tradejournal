import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RADAR_COLLAUDO_2026_08_23 } from "@/lib/macro-radar.fixture";
import { righeDaPayload } from "@/lib/macro-radar";
import { radarReportSchema } from "@/lib/validations/macro-radar";
import type { RadarReportCompleto } from "@/lib/queries/macro-radar";
import { RadarMaiArrivato, RadarView } from "./radar-view";

/**
 * Rendering del Radar senza DOM (renderToStaticMarkup), come per il pannello
 * COT e il termometro.
 *
 * Il vincolo centrale è quello NON NEGOZIABILE: «area senza novità» e «area
 * non verificabile» devono restare inequivocabili. Qui è verificato sul
 * markup, non a occhio — e insieme al principio del Round-26, che vieta
 * verdetti calcolati.
 */

/** Il report come lo vedrebbe la pagina, costruito dal payload VERO. */
function reportDelCollaudo(
  modifiche: Partial<RadarReportCompleto> = {},
): RadarReportCompleto {
  const esito = radarReportSchema.safeParse(
    JSON.parse(JSON.stringify(RADAR_COLLAUDO_2026_08_23)),
  );
  if (!esito.success) throw new Error(esito.error.issues[0].message);
  const righe = righeDaPayload(esito.data);

  const conId = <T,>(voci: T[]) =>
    voci.map((v, i) => ({ ...v, id: `id-${i}`, reportId: "rep" }));

  return {
    id: "rep",
    ...righe.report,
    payload: {},
    createdAt: new Date("2026-08-27T15:31:00Z"),
    updatedAt: new Date("2026-08-27T15:31:00Z"),
    highlights: conId(righe.highlights),
    changes: conId(righe.changes),
    readings: conId(righe.readings),
    watches: conId(righe.watches),
    emptyAreas: conId(righe.emptyAreas),
    unverifiable: conId(righe.unverifiable),
    ...modifiche,
  } as unknown as RadarReportCompleto;
}

function rendi(
  report: RadarReportCompleto,
  settimaneCieche: Record<string, number> = { B: 1, C: 1, F: 1 },
): string {
  return renderToStaticMarkup(
    <RadarView
      report={report}
      settimane={[{ weekOf: "2026-08-23", voci: 4 }]}
      weekOfCorrente="2026-08-23"
      settimaneCieche={settimaneCieche}
    />,
  );
}

/** Il frammento di markup di un blocco, dal suo titolo al successivo. */
function blocco(html: string, titolo: string, prossimo: string): string {
  const da = html.indexOf(titolo);
  const a = html.indexOf(prossimo, da);
  expect(da, `blocco «${titolo}» assente`).toBeGreaterThan(-1);
  expect(a, `blocco «${prossimo}» assente`).toBeGreaterThan(da);
  return html.slice(da, a);
}

describe("RadarView — vuoto e non verificabile non si confondono", () => {
  const html = rendi(reportDelCollaudo());

  it("i due blocchi esistono, separati e nell'ordine dichiarato", () => {
    expect(html.indexOf("Aree senza novità")).toBeGreaterThan(-1);
    expect(html.indexOf("Aree non verificabili")).toBeGreaterThan(
      html.indexOf("Aree senza novità"),
    );
  });

  it("le aree VUOTE sono D e G, e stanno solo nel loro blocco", () => {
    const vuote = blocco(html, "Aree senza novità", "Aree non verificabili");
    expect(vuote).toContain("D · Regolamentazione");
    expect(vuote).toContain("G · Letture e ricerca");
    expect(vuote).not.toContain("Broker e costi");
    expect(vuote).not.toContain("Dati e API");
  });

  it("le aree NON VERIFICABILI sono B, C ed F, ciascuna col suo motivo", () => {
    const cieche = html.slice(html.indexOf("Aree non verificabili"));
    expect(cieche).toContain("B · Borse e strumenti quotati");
    expect(cieche).toContain("C · Broker e costi");
    expect(cieche).toContain("F · Dati e API");
    expect(cieche).toContain("non espone l&#x27;elenco");
    expect(cieche).toContain("nessun canale di annunci ufficiale enumerabile");
    // Nessuna delle vuote è finita qui dentro.
    expect(cieche).not.toContain("D · Regolamentazione");
  });

  it("il blocco delle non verificabili dice che NON è un «nessuna novità»", () => {
    const cieche = html.slice(html.indexOf("Aree non verificabili"));
    expect(cieche).toContain("La fonte non è stata letta");
    expect(cieche).toContain("non è un «nessuna novità»");
  });

  it("solo il blocco d'avviso porta il bordo d'allarme: la distinzione è visiva", () => {
    const vuote = blocco(html, "Aree senza novità", "Aree non verificabili");
    const cieche = html.slice(html.indexOf("Aree non verificabili"));
    expect(vuote).not.toContain("--md-warn");
    expect(cieche).toContain("border-left:3px solid var(--md-warn)");
  });

  it("un'area può essere non verificabile E portare una voce: la pagina lo spiega", () => {
    expect(html).toContain("può comunque portare una voce nel");
    // B è nella tabella dei cambiamenti E fra le non verificabili.
    const tabella = blocco(html, "Cosa è cambiato", "In osservazione");
    expect(tabella).toContain("E-nano");
  });
});

describe("RadarView — l'avviso che si ripete deve saltare all'occhio", () => {
  it("alla prima settimana NON mostra il conteggio: non direbbe nulla", () => {
    const html = rendi(reportDelCollaudo(), { B: 1, C: 1, F: 1 });
    expect(html).not.toContain("non verificabile da");
  });

  it("ripetuta, l'area porta il conteggio e un contorno che la stacca", () => {
    const html = rendi(reportDelCollaudo(), { B: 1, C: 5, F: 2 });
    expect(html).toContain("non verificabile da 5 settimane");
    expect(html).toContain("non verificabile da 2 settimane");
    // B è cieca da una sola settimana: niente conteggio, niente contorno.
    expect(html).not.toContain("non verificabile da 1 settimane");
    expect(html).toContain("outline:1px solid var(--md-warn)");
  });
});

describe("RadarView — il resto della pagina", () => {
  const html = rendi(reportDelCollaudo());

  it("mostra sempre la finestra coperta e che è stata estesa", () => {
    expect(html).toContain("Finestra osservata");
    expect(html).toContain("13 ago – 27 ago 2026");
    // La pagina conta la finestra come la conta il task nelle sue note.
    expect(html).toContain("14 giorni");
    expect(html).toContain("estesa");
  });

  it("le cose che contano portano l'azione conseguente", () => {
    const top = blocco(html, "Le cose che contano", "Cosa è cambiato");
    expect(top).toContain("Cosa fare");
    expect(top).toContain("Verificare con il broker");
  });

  it("la tabella ha le sei colonne chieste, e le fonti sono link cliccabili", () => {
    const tabella = blocco(html, "Cosa è cambiato", "In osservazione");
    for (const colonna of ["Area", "Chi", "In vigore dal", "Impatto", "Fonte"]) {
      expect(tabella, colonna).toContain(`>${colonna}<`);
    }
    expect(tabella).toContain(
      'href="https://www.cmegroup.com/notices/ser/2026/08/ser-9789.html"',
    );
    expect(tabella).toContain('rel="noopener noreferrer"');
    // «Chi» ricavato dal nome della fonte.
    expect(tabella).toContain(">CME Group<");
    expect(tabella).toContain(">FTMO<");
  });

  it("una voce senza data di efficacia lo DICE, non lascia un buco", () => {
    const tabella = blocco(html, "Cosa è cambiato", "In osservazione");
    expect(tabella).toContain("non dichiarata");
  });

  it("le Letture restano fuori dalla tabella dei cambiamenti", () => {
    const letture = blocco(html, "Letture", "Aree senza novità");
    expect(letture).toContain("Nessuna lettura segnalata");
    expect(letture).toContain("nulla qui entra in vigore");
  });

  it("le sezioni vuote lo dicono invece di sparire", () => {
    expect(html).toContain("Niente in osservazione in questa settimana");
  });

  it("PRINCIPIO DEL ROUND-26: nessun verdetto, nessuna probabilità, nessun punteggio", () => {
    const vietati = [
      "probabilit",
      "punteggio",
      "score",
      "rilevanza",
      "previsione",
      "raccomandazione",
      "%",
    ];
    const testo = html.replace(/<[^>]*>/g, " ").toLowerCase();
    for (const parola of vietati) {
      expect(testo, `la pagina non deve contenere «${parola}»`).not.toContain(parola);
    }
  });
});

describe("RadarMaiArrivato", () => {
  it("dice che non è mai arrivato niente, non che non è cambiato niente", () => {
    const html = renderToStaticMarkup(<RadarMaiArrivato />);
    expect(html).toContain("Nessun registro ancora");
    expect(html).toContain("non perché non sia cambiato niente");
  });
});
