import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import sample from "../../../../docs/macro-desk-sample-report.json";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { LACUNE_VOL, vociSenzaFonteLibera } from "@/lib/volatilita-report";
import type { ContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import { ListinoVolatilita, type DatiVolatilita } from "./volatilita";

/**
 * Resa della sezione Volatilità nel linguaggio «Listino».
 *
 * I due casi sul blocco del report vengono da `report-tabs.test.tsx` e
 * sorvegliano la stessa cosa di prima: che gli indici con fonte libera non
 * ricompaiano col vintage del report accanto agli stessi indici più freschi, e
 * che ciò che viene dal report sia etichettato come tale.
 *
 * I casi sulla forma sono nuovi e sorvegliano le tre promesse della direzione:
 * le misure stanno in tabelle, la prosa non sta nel flusso, il commento è
 * chiuso e in fondo.
 */

const full = parseMacroPayload(sample);

const contestoVuoto: ContestoVolatilita = {
  righe: [],
  oggi: "2026-08-28",
  strutturaTermine: null,
  strutturaWti: { ok: false, motivo: "front_non_disponibile" },
  climaCopertura: [],
};

function dati(override: Partial<DatiVolatilita> = {}): DatiVolatilita {
  const vol = full.volPanel;
  return {
    contesto: contestoVuoto,
    fuso: "Europe/Rome",
    oggi: "2026-08-28",
    lacune: LACUNE_VOL,
    vociReport: vociSenzaFonteLibera(vol?.items ?? []),
    commento: vol?.reading,
    giornoReport: "2026-07-21",
    inventari: { voci: [], motivoAssenza: "chiave non configurata", fonte: "EIA" },
    ...override,
  };
}

const html = (override?: Partial<DatiVolatilita>) =>
  renderToStaticMarkup(<ListinoVolatilita dati={dati(override)} />);

describe("Listino Volatilità — il blocco che viene dal report", () => {
  it("gli indici con fonte libera NON compaiono nel blocco del report", () => {
    /* Dal 26/08/2026 VIX, VVIX, SKEW, GVZ e OVX arrivano dal CBOE ogni notte e
       stanno nel listino: farli comparire anche qui, col vintage del report, è
       ciò che il 26/08 metteva sulla stessa pagina un GVZ a 23,92 «vintage
       14-18 agosto» e un GVZ a 27,69 del 25 agosto. */
    const out = html();
    for (const k of ["VVIX", "SKEW", "GVZ", "OVX"]) {
      expect(out).not.toContain(`${k} · `);
    }
    expect(out).toContain("MOVE");
    expect(out).toContain("PUT/CALL");
  });

  it("ciò che viene dal report porta la data del report, non un'età", () => {
    const out = html();
    // La colonna «Del report» esiste e porta la data, in forma breve.
    expect(out).toContain("Del report");
    expect(out).toContain("21/07/26");
    expect(out).toContain("Commento del report del 21/07/26");
  });

  it("il commento è in fondo e CHIUSO: è prosa in una pagina di tabelle", () => {
    const out = html();
    expect(out).toContain("<details");
    // Nessun `open`: si apre solo se lo si chiede.
    expect(out).not.toContain("<details open");
    // E resta dopo la tabella del report, non a metà pagina.
    expect(out.indexOf("Del report")).toBeLessThan(out.indexOf("<details"));
  });

  it("senza commento non compare nessun blocco vuoto", () => {
    expect(html({ commento: undefined })).not.toContain("<details");
  });
});

describe("Listino Volatilità — la forma", () => {
  it("le misure stanno in tabelle vere, non in frasi", () => {
    const out = html();
    expect(out).toContain('class="ml-tab"');
    expect(out).toContain("<thead>");
  });

  it("la provenienza è dichiarata UNA volta, in cima", () => {
    const out = html();
    const occorrenze = out.split("archivio giornaliero").length - 1;
    expect(occorrenze).toBe(1);
    expect(out).toContain("nel fuso Europe/Rome");
  });

  it("le spiegazioni sono bottoni, non paragrafi nel flusso", () => {
    const out = html();
    expect(out).toContain('class="ml-info"');
    /* Il testo della spiegazione NON è nel documento finché non si apre: il
       contenuto del popover vive in un portale montato al click. È la
       differenza fra questa direzione e le venticinque note in coda. */
    expect(out).not.toContain("è lo spazio che il prezzo ha attraversato");
  });

  it("senza scorte lo dichiara invece di mostrare una tabella vuota", () => {
    expect(html()).toContain("chiave non configurata");
  });

  /* Il calendario è uscito dalla sezione il 28/08/2026. Qui non deve tornare
     per sbaglio. */
  it("il calendario degli eventi NON è in questa sezione", () => {
    const out = html();
    expect(out).not.toContain("Prossimi sette giorni");
    expect(out).not.toContain("Ora della fonte");
  });

  it("con l'archivio muto la pagina regge e non lancia", () => {
    expect(() => html()).not.toThrow();
  });
});

describe("Listino Volatilità — la struttura a termine", () => {
  /* I due rapporti della curva sono numeri DIVERSI che si assomigliano
     (0,871 e 0,848): una resa che ne mostrasse uno solo, ripetuto, sarebbe
     indistinguibile da una giusta a colpo d'occhio. Questo caso li tiene
     separati. */
  const conTermine = () =>
    renderToStaticMarkup(
      <ListinoVolatilita
        dati={dati({
          contesto: {
            ...contestoVuoto,
            strutturaTermine: {
              fonte: "CBOE Global Markets",
              livelli: [
                { sigla: "VIX9D", valore: 13.45, giorno: "2026-08-25", etaGiorni: 3 },
                { sigla: "VIX", valore: 15.45, giorno: "2026-08-25", etaGiorni: 3 },
                { sigla: "VIX3M", valore: 18.21, giorno: "2026-08-25", etaGiorni: 3 },
              ],
              rapporti: [
                {
                  corta: "VIX9D",
                  lunga: "VIX",
                  valoreCorta: 13.45,
                  valoreLunga: 15.45,
                  rapporto: 13.45 / 15.45,
                  rango: null,
                  giorno: "2026-08-25",
                },
                {
                  corta: "VIX",
                  lunga: "VIX3M",
                  valoreCorta: 15.45,
                  valoreLunga: 18.21,
                  rapporto: 15.45 / 18.21,
                  rango: null,
                  giorno: "2026-08-25",
                },
              ],
            },
          },
        })}
      />,
    );

  it("i due rapporti sono resi ciascuno col proprio valore", () => {
    const out = conTermine();
    expect(out).toContain("0,871");
    expect(out).toContain("0,848");
  });

  it("i tre livelli della curva compaiono tutti", () => {
    const out = conTermine();
    for (const v of ["13,45", "15,45", "18,21"]) {
      expect(out).toContain(v);
    }
  });
});
