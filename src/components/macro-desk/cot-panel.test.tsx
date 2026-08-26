import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { IMPLICAZIONI_MECCANICHE } from "@/lib/cot-contesto";
import { costruisciPannelloCot, type SerieCotPerStrumento } from "@/lib/cot-panel";
import { parseCsvStoricoCot } from "@/lib/cot-sync";
import { CotPanel } from "./cot-panel";

/**
 * Rendering del pannello COT (renderToStaticMarkup, senza DOM), come per il
 * termometro di volatilità. Il vincolo centrale è l'ASSENZA di linguaggio
 * predittivo: il test pre-registrato è fallito, quindi a schermo non possono
 * comparire quote di successo, probabilità o percentili — nemmeno per negarli.
 *
 * Fixture: il CSV storico troncato al cutoff del JSON di produzione — i
 * valori resi sono quindi ESATTAMENTE quelli verificati dal test di
 * regressione contro il generatore Python (cot-metrics.test.ts).
 */

const CUTOFF = "2026-06-30";

function serieDaCsv(): SerieCotPerStrumento {
  const righe = parseCsvStoricoCot(
    readFileSync(join(process.cwd(), "dati", "COT_gold_wti.csv"), "utf8"),
  ).filter((r) => r.settimana.reportDate <= CUTOFF);
  const fuori: SerieCotPerStrumento = {};
  for (const r of righe) {
    const perStrumento = (fuori[r.strumento] ??= {});
    (perStrumento.mm_net ??= []).push({
      reportDate: r.settimana.reportDate,
      valore: r.settimana.mmNet,
    });
    (perStrumento.open_interest ??= []).push({
      reportDate: r.settimana.reportDate,
      valore: r.settimana.openInterest,
    });
  }
  return fuori;
}

const PANNELLO_FRESCO = costruisciPannelloCot(serieDaCsv(), new Date("2026-07-01T12:00:00Z"));
const html = renderToStaticMarkup(<CotPanel pannello={PANNELLO_FRESCO} />);

/** Isola il markup di una carta, sui confini reali delle card. */
function cardDi(markup: string, testo: string) {
  const pezzi = markup.split('<div class="md-card md-card-hover').filter((c) => c.includes(testo));
  expect(pezzi.length).toBeGreaterThanOrEqual(1);
  return pezzi;
}

describe("CotPanel — parole vietate", () => {
  // Vietato qualunque linguaggio che suggerisca capacità predittiva, e il
  // gergo dei percentili (richiesta esplicita: formato a tre livelli, non
  // "87° percentile"). "edge" è la parola vietata ereditata dal termometro.
  it.each([
    "hit rate",
    "probabilit", // probabilità, probabile
    "affidabilit", // affidabilità, affidabile
    "prevision", // previsione, previsionale
    "prevede",
    "predi", // predice, predittivo, predizione
    "percentile",
    "edge",
    "segnale",
  ])("il markup non contiene '%s'", (parola) => {
    expect(html.toLowerCase()).not.toContain(parola);
  });

  it("nemmeno nel pannello stantio o nel fallback", () => {
    const stantio = renderToStaticMarkup(
      <CotPanel pannello={costruisciPannelloCot(serieDaCsv(), new Date("2026-08-30T12:00:00Z"))} />,
    );
    const vuoto = renderToStaticMarkup(
      <CotPanel pannello={{ carte: [], meta: null }} />,
    );
    for (const parola of ["percentile", "probabilit", "prevision", "edge", "segnale"]) {
      expect(stantio.toLowerCase()).not.toContain(parola);
      expect(vuoto.toLowerCase()).not.toContain(parola);
    }
  });
});

describe("CotPanel — struttura", () => {
  it("quattro carte: ORO e PETROLIO WTI, ciascuno con posizionamento e partecipazione", () => {
    /* Si conta la BARRA, una per carta: le etichette ricompaiono anche nei
       riquadri dell'implicazione meccanica, che dal 26/08/2026 sono sempre
       resi (prima esistevano solo col box notizie). */
    expect(html.match(/Posizione nel range storico: \d+ su 100/g)?.length).toBe(4);
    expect(html).toContain("Posizionamento speculativo");
    expect(html).toContain("Partecipazione");
    expect(html).toContain("ORO");
    expect(html).toContain("PETROLIO WTI");
  });

  it("ogni carta porta la banda verbale e la barra di posizione", () => {
    // le bande calcolate sul campione del cutoff
    expect(html).toContain("NELLA NORMA");
    expect(html).toContain("MOLTO BASSO");
    expect(html).toContain("BASSO");
    // barra: una per carta, con posizione dichiarata per gli screen reader
    expect(html.match(/Posizione nel range storico: \d+ su 100/g)?.length).toBe(4);
  });

  it("la barra è una traccia VISIBILE, non il solo puntino sospeso", () => {
    // Regressione: la traccia usava `flex-1` dentro un contenitore
    // `flex-col`, dove `flex: 1 1 0%` azzera la flex-basis sull'altezza —
    // altezza computata 0px, a schermo restava il puntino da solo.
    const tracce = html.match(/class="relative h-2 w-full rounded-full"/g);
    expect(tracce?.length).toBe(4);
    // Nessuna traccia porta più `flex-1` (il `flex-1` del corpo carta, che
    // è un figlio a stretch di una card alta, resta legittimo).
    expect(html).not.toMatch(/class="[^"]*\bh-2\b[^"]*\bflex-1\b/);
    expect(html).not.toMatch(/class="[^"]*\bflex-1\b[^"]*\bh-2\b/);
    // Le tacche dei confini di banda restano sulla traccia (4 per carta).
    for (const confine of [10, 30, 70, 90]) {
      expect(html.match(new RegExp(`left:${confine}%`, "g"))?.length).toBe(4);
    }
  });

  it("la frase in linguaggio piano combacia col generatore pre-registrato", () => {
    expect(html).toContain("Più alto che nel 62% delle settimane dal 2017");
    expect(html).toContain("Più basso che nel 98% delle settimane dal 2017");
  });

  it("la riga di rarità compare solo per le carte che la dichiarano", () => {
    // stesso escape che applica React al testo (l'apostrofo diventa &#x27;)
    const escaped = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
    const conRarita = PANNELLO_FRESCO.carte.filter((c) => c.rigaRarita !== null);
    expect(conRarita.length).toBeGreaterThanOrEqual(1);
    for (const c of conRarita) {
      expect(html).toContain(escaped(c.rigaRarita as string));
    }
    // nessun segnaposto al posto delle rarità assenti
    expect(html.match(/Capita circa/g)?.length).toBe(conRarita.length);
  });

  it("valore assoluto e variazione a 4 settimane, formattati all'italiana", () => {
    expect(html).toContain("120.091 contratti");
    expect(html).toContain("+7.912 in 4 settimane");
    expect(html).toContain("1.914.443 contratti");
    expect(html).toContain("−110.737 in 4 settimane");
  });

  it("l'ultima volta a livelli simili è in italiano, non in inglese", () => {
    expect(html).toContain("Ultima volta a questi livelli: gennaio 2026");
    expect(html).toContain("Ultima volta a questi livelli: maggio 2026");
    expect(html).not.toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
  });

  it("se ultima volta simile è null la riga sparisce, senza segnaposto", () => {
    const pannello = structuredClone(PANNELLO_FRESCO);
    for (const c of pannello.carte) c.ultimaVoltaSimile = null;
    const senza = renderToStaticMarkup(<CotPanel pannello={pannello} />);
    expect(senza).not.toContain("Ultima volta a questi livelli");
  });
});

describe("CotPanel — cadenza e trasparenza", () => {
  it("dichiara a schermo che il dato è settimanale e a quando è aggiornato", () => {
    expect(html).toContain("Dato settimanale, aggiornato al 30/06/2026");
    expect(html).toContain("venerdì");
    expect(html).toContain("martedì precedente");
  });

  it("dato fermo oltre soglia: lo dichiara con i giorni, invece di mostrarlo come fresco", () => {
    const stantio = renderToStaticMarkup(
      <CotPanel pannello={costruisciPannelloCot(serieDaCsv(), new Date("2026-08-30T12:00:00Z"))} />,
    );
    expect(stantio).toContain("dato fermo al 30/06/2026");
    expect(stantio).toContain("non aggiornato da 61 giorni");
    expect(stantio).not.toContain("Dato settimanale, aggiornato al");
  });

  it("dichiara fonte e finestra di riferimento", () => {
    expect(html).toContain("CFTC");
    expect(html).toContain("2017 → oggi");
    expect(html).toContain("496 settimane per strumento");
  });

  it("si presenta come fotografia descrittiva, non come indicazione sul prezzo", () => {
    expect(html).toContain("fotografia");
    expect(html).toContain("non un&#x27;indicazione su dove andrà il prezzo");
  });

  it("senza dati degrada a un messaggio esplicito, senza lanciare", () => {
    const vuoto = renderToStaticMarkup(
      <CotPanel pannello={{ carte: [], meta: null }} />,
    );
    expect(vuoto).toContain("Pannello COT non disponibile");
  });
});

/**
 * Il 26/08/2026 il box «Contesto della settimana» — 2-3 titoli da Google
 * News per strumento — è stato rimosso. Questi test tengono fermo il dopo:
 * nessun titolo, nessun link esterno, e l'implicazione meccanica che PRIMA
 * viveva dentro quel box adesso c'è sempre, perché discende dalla
 * definizione della metrica e non da un job settimanale.
 */
describe("CotPanel — implicazione meccanica, senza notizie", () => {
  it("un riquadro per strumento, sempre presente", () => {
    expect(html.match(/Implicazione meccanica/g)?.length).toBe(2);
  });

  it("il testo è quello della tabella statica per la banda corrente", () => {
    for (const carta of PANNELLO_FRESCO.carte) {
      expect(html).toContain(IMPLICAZIONI_MECCANICHE[carta.metrica][carta.banda]);
    }
  });

  it("nessun titolo di giornale e nessun link esterno nel pannello", () => {
    expect(html).not.toContain("Contesto della settimana");
    expect(html).not.toContain("Google News");
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("riscritti");
  });

  it("dichiara da dove viene la frase, e che non è un'aspettativa", () => {
    expect(html).toContain("discende dalla definizione della metrica");
    expect(html).toContain("non è una lettura della cronaca");
  });
});

describe("CotPanel — accenti", () => {
  it("le carte dell'oro e del petrolio usano gli accenti del desk", () => {
    for (const pezzo of cardDi(html, "ORO")) {
      expect(pezzo).toContain("var(--md-gold)");
    }
    for (const pezzo of cardDi(html, "PETROLIO WTI")) {
      expect(pezzo).toContain("var(--md-oil)");
    }
  });

  it("le bande estreme hanno un accento diverso da NELLA NORMA", () => {
    expect(html).toContain("var(--md-warn)"); // MOLTO BASSO (partecipazione oro)
  });
});
