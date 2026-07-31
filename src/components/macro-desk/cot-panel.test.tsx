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
      <CotPanel pannello={{ carte: [], meta: null, contesto: null }} />,
    );
    for (const parola of ["percentile", "probabilit", "prevision", "edge", "segnale"]) {
      expect(stantio.toLowerCase()).not.toContain(parola);
      expect(vuoto.toLowerCase()).not.toContain(parola);
    }
  });
});

describe("CotPanel — struttura", () => {
  it("quattro carte: ORO e PETROLIO WTI, ciascuno con posizionamento e partecipazione", () => {
    expect(html.match(/Posizionamento speculativo/g)?.length).toBe(2);
    expect(html.match(/Partecipazione/g)?.length).toBe(2);
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
      <CotPanel pannello={{ carte: [], meta: null, contesto: null }} />,
    );
    expect(vuoto).toContain("Pannello COT non disponibile");
  });
});

describe("CotPanel — sezione contesto (box notizie)", () => {
  const CONTESTO = {
    generatoIl: "2026-07-31T05:12:00.000Z",
    contenuto: {
      tipo: "notizie" as const,
      settimanaCot: "2026-07-21",
      strumenti: {
        GOLD: {
          notizie: [
            {
              titolo: "Oro: domanda stabile nel secondo trimestre, gli acquisti delle banche centrali compensano i deflussi dagli ETF",
              url: "https://esempio.org/oro-domanda",
              fonte: "MarketScreener Italia",
              data: "2026-07-30",
            },
            {
              titolo: "Le riserve auree mondiali nel rapporto del secondo trimestre",
              url: "https://esempio.org/riserve",
              fonte: "WGC",
              data: "2026-07-24",
            },
          ],
        },
        WTI: { notizie: null },
      },
    },
  };
  const pannelloConContesto = { ...PANNELLO_FRESCO, contesto: CONTESTO };
  const conContesto = renderToStaticMarkup(<CotPanel pannello={pannelloConContesto} />);

  it("senza box la sezione non esiste affatto (degrado sicuro del job)", () => {
    expect(html).not.toContain("Contesto della settimana");
    expect(html).not.toContain("Implicazione meccanica");
  });

  it("le parole vietate non compaiono nemmeno nella sezione contesto", () => {
    for (const parola of ["hit rate", "probabilit", "affidabilit", "prevision", "predi", "percentile", "edge", "segnale"]) {
      expect(conContesto.toLowerCase()).not.toContain(parola);
    }
  });

  it("i titoli sono link esterni curati: href, nuova scheda, fonte e data in mono", () => {
    expect(conContesto).toContain('href="https://esempio.org/oro-domanda"');
    expect(conContesto).toContain('target="_blank"');
    expect(conContesto).toContain('rel="noopener noreferrer"');
    expect(conContesto).toContain("MarketScreener Italia · 30/07/2026");
    expect(conContesto).toContain("WGC · 24/07/2026");
  });

  it("strumento senza notizie → la dicitura esplicita, mai un riempitivo", () => {
    expect(conContesto).toContain("Nessun contesto rilevante trovato questa settimana.");
  });

  it("l'implicazione meccanica è presente, separata, e coerente con la banda corrente", () => {
    // un riquadro per strumento
    expect(conContesto.match(/Implicazione meccanica/g)?.length).toBe(2);
    // il testo statico della tabella per le bande correnti delle carte
    for (const carta of PANNELLO_FRESCO.carte) {
      expect(conContesto).toContain(IMPLICAZIONI_MECCANICHE[carta.metrica][carta.banda]);
    }
  });

  it("dichiara provenienza, non-riscrittura e data di generazione", () => {
    expect(conContesto).toContain("mai");
    expect(conContesto).toContain("riscritti");
    expect(conContesto).toContain("contesto generato il 31/07/2026");
    expect(conContesto).toContain("discende dalla definizione della metrica");
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
