import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { GuidaVolatilita } from "./guida-volatilita";

/**
 * LA GUIDA È PARTE DELLA SEZIONE, e vale per lei la stessa disciplina che vale
 * per i numeri che spiega: niente linguaggio da segnale, niente aspettative di
 * prezzo. Una guida che si permette quello che la sezione si vieta è il modo
 * più rapido per rimettere dentro dalla porta di servizio ciò che si è appena
 * tolto dalla principale.
 */

const html = renderToStaticMarkup(<GuidaVolatilita />);
const testo = html.replace(/<[^>]+>/g, " ").toLowerCase();

describe("GuidaVolatilita — cosa dichiara", () => {
  it("nasce CHIUSA: si legge una volta, i dati si guardano ogni mattina", () => {
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
  });

  it("il riassunto dice già la cosa più importante, così chiuderla non la nasconde", () => {
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("quanto sarà larga la giornata");
    expect(summary).toContain("mai a «dove va il prezzo»");
  });

  it("copre tutti i blocchi che la sezione mostra davvero", () => {
    /* «eventi programmati» non è più in elenco: il calendario è uscito dalla
       sezione il 28/08/2026 e vive nella Sintesi. Una guida che descrive un
       blocco che non c'è è peggio di una guida più corta. */
    for (const blocco of [
      "volatilità implicita",
      "implicita contro realizzata",
      "escursione vera",
      "struttura a termine",
      "skew",
    ]) {
      expect(testo).toContain(blocco);
    }
  });

  it("dice a quale decisione serve la sezione, non solo cosa contiene", () => {
    expect(testo).toContain("dimensionare stop e size");
    expect(testo).toContain("il numero dello stop");
  });
});

describe("GuidaVolatilita — quello che non si permette", () => {
  it("nessuna aspettativa di prezzo, nessun lessico operativo", () => {
    for (const vietata of [
      "salirà",
      "scenderà",
      "rialzist",
      "ribassist",
      "conviene comprare",
      "conviene vendere",
      "target",
      "consiglia",
      "suggerisce di",
    ]) {
      expect(testo).not.toContain(vietata);
    }
  });

  it("non resuscita il termometro: lo cita SOLO come cosa rimossa", () => {
    // La parola compare una volta sola, e nella frase che dice che non c'è più.
    const occorrenze = testo.split("termometro").length - 1;
    expect(occorrenze).toBe(1);
    expect(testo).toContain("ed è stato tolto");
  });

  it("dichiara che nessun fatto è stato tolto insieme al termometro", () => {
    expect(testo).toContain("nessun fatto è stato tolto");
  });
});

describe("il rimando alla guida estesa punta a un file che esiste", () => {
  it("il percorso citato in pagina è leggibile e non è vuoto", () => {
    // Un rimando a un documento inesistente è peggio di nessun rimando.
    const percorso = "docs/macro-desk/GUIDA-MACRO-DESK.md";
    expect(html).toContain(percorso);
    const doc = readFileSync(percorso, "utf8");
    expect(doc.length).toBeGreaterThan(4000);
    expect(doc).toContain("# Come si legge il Macro Desk");
  });

  it("la guida estesa contiene le parti che la pagina promette", () => {
    const doc = readFileSync("docs/macro-desk/GUIDA-MACRO-DESK.md", "utf8");
    /* La guida copre TUTTO il desk dal 28/08/2026, non la sola Volatilità:
       queste sono le parti che una pagina del desk rimanda a lei. */
    for (const parte of [
      "stop e size",
      "Come si legge un rango storico",
      "Implicita e realizzata",
      "Contango e backwardation",
      "Il posizionamento COT",
      "Le convenzioni",
    ]) {
      expect(doc).toContain(parte);
    }
  });
});
