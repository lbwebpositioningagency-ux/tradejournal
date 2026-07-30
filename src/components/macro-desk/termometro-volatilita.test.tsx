import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TermometroVolatilita } from "./termometro-volatilita";

/**
 * Rendering del termometro (renderToStaticMarkup, senza DOM), come per gli altri tab.
 * Verifica i vincoli di interfaccia della spec: banda 25-75% sempre presente, base rate
 * sotto la quota, n per cella, finestra di riferimento dichiarata, parola vietata assente,
 * e — nuovo — che l'S&P 500 sia riconoscibile come solo contesto macro.
 */

const INGRESSI_COMPLETI = {
  XAUUSD: { iv: 24.3, close: 4076.4 },
  WTICOUSD: { iv: 60.62, close: 64.93 },
  SP500: { iv: 20, close: 7509 },
};

function resa(ingressi: Record<string, { iv: number | null; close?: number | null }>) {
  return renderToStaticMarkup(<TermometroVolatilita ingressi={ingressi} />);
}

/**
 * Isola il markup della card di uno strumento. Si divide sui confini reali delle card
 * (ogni card apre con `<div class="md-card`): una finestra a larghezza fissa sborderebbe
 * sulle card adiacenti e i test misurerebbero il vicino.
 */
function cardDi(html: string, simbolo: string) {
  const pezzi = html.split('<div class="md-card').filter((c) => c.includes(simbolo));
  expect(pezzi).toHaveLength(1);
  return pezzi[0];
}

describe("TermometroVolatilita — resa", () => {
  const html = resa(INGRESSI_COMPLETI);

  it("non lancia e mostra le tre carte visibili; il GER40 non compare affatto", () => {
    for (const s of ["XAUUSD", "WTICOUSD", "SP500"]) {
      expect(html).toContain(s);
    }
    expect(html).not.toContain("GER40");
  });

  it("la parola vietata non compare a schermo", () => {
    expect(html.toLowerCase()).not.toContain("edge");
  });

  it("la banda 25-75% accompagna sempre la mediana", () => {
    expect(html).toContain("banda 25-75%");
    // una per ogni carta popolata (GER40 non ha l'indice IV in ingresso)
    expect(html.match(/banda 25-75%/g)?.length).toBe(3);
  });

  it("il base rate compare sotto ogni quota", () => {
    expect(html.match(/Senza il termometro/g)?.length).toBe(3);
  });

  it("la n della cella è sempre dichiarata", () => {
    expect(html.match(/\(n=\d+\)/g)?.length).toBe(3);
  });

  it("dichiara la finestra di riferimento di ogni strumento", () => {
    expect(html).toContain("rif. 2008-2026");
    expect(html).toContain("rif. 2007-2026");
    expect(html).toContain("rif. 2000-2026");
  });

  it("dichiara i due periodi, calcolo su storia e verifica fuori campione", () => {
    expect(html).toContain("su tutta la storia disponibile");
    expect(html).toContain("non sono una");
    expect(html).toContain("periodo mai visto");
  });

  it("non presenta il termometro come previsione propria", () => {
    expect(html).toContain("è la previsione del mercato");
  });
});

describe("TermometroVolatilita — l'S&P 500 è solo contesto macro", () => {
  const html = resa(INGRESSI_COMPLETI);
  const cardSp = cardDi(html, "SP500");

  it("la carta dell'S&P 500 porta il badge di contesto macro", () => {
    expect(cardSp).toContain("contesto macro");
  });

  it("spiega a parole che non è uno strumento tradato", () => {
    expect(cardSp).toContain("Non è uno strumento tradato");
  });

  it("il badge compare una volta sola in tutta la sezione", () => {
    expect(html.match(/contesto macro/g)?.length).toBe(1);
  });

  it.each(["XAUUSD", "WTICOUSD"])("la carta di %s non porta quel badge", (s) => {
    expect(cardDi(html, s)).not.toContain("contesto macro");
  });

  it("mostra un percentile puntuale, ora che la griglia è completa da VIXCLS", () => {
    expect(cardSp).toMatch(/\d+° percentile/);
    expect(cardSp).not.toContain("fra il ");
  });

  it("mostra comunque la durata media dello stato, come gli strumenti tradati", () => {
    // il ruolo "contesto macro" è una questione di uso, non di dati mancanti: la
    // griglia e la persistenza dell'S&P 500 sono complete quanto quelle degli altri tre
    expect(cardSp).toContain("Cambia in media");
  });

  it("mostra l'ampiezza in punti indice quando la chiusura è plausibile", () => {
    expect(cardSp).toContain("punti indice");
  });
});

describe("TermometroVolatilita — strumenti gestiti", () => {
  const html = resa(INGRESSI_COMPLETI);

  it("l'oro mostra un percentile puntuale e la durata media dello stato", () => {
    const card = cardDi(html, "XAUUSD");
    expect(card).toMatch(/\d+° percentile/);
    expect(card).not.toContain("fra il ");
    expect(card).toContain("Cambia in media");
  });
});

describe("TermometroVolatilita — GER40 nascosto per flag, non per assenza di dati", () => {
  const html = resa(INGRESSI_COMPLETI);

  it("il GER40 non compare nel markup: né carta popolata né 'dato non disponibile'", () => {
    // prima dell'introduzione di visibile_in_ui il GER40 sarebbe apparso come
    // "dato non disponibile" (nessun ingresso IV, DV1X non in pipeline). Ora il filtro
    // generico lo esclude dalla resa a monte, prima ancora di valutare l'ingresso.
    expect(html).not.toContain("GER40");
    expect(html).not.toContain("dato non disponibile");
  });

  it("il fallback 'dato non disponibile' resta generico: si vede su un altro strumento visibile senza ingresso", () => {
    const htmlSenzaWti = resa({ XAUUSD: INGRESSI_COMPLETI.XAUUSD, SP500: INGRESSI_COMPLETI.SP500 });
    const cardWti = cardDi(htmlSenzaWti, "WTICOUSD");
    expect(cardWti).toContain("dato non disponibile");
    // e il GER40 resta comunque assente, indipendentemente da quali altri ingressi mancano
    expect(htmlSenzaWti).not.toContain("GER40");
  });

  it("il flag non dipende dagli ingressi passati al componente: GER40 resta nascosto anche se gli si fornisce un ingresso", () => {
    const html2 = resa({ ...INGRESSI_COMPLETI, GER40: { iv: 25, close: 20000 } });
    expect(html2).not.toContain("GER40");
  });
});

describe("TermometroVolatilita — tutti e quattro hanno dati completi, ruolo resta il discriminante", () => {
  const html = resa(INGRESSI_COMPLETI);

  it.each(["XAUUSD", "WTICOUSD", "SP500"])("%s mostra sia il percentile sia la durata", (s) => {
    const card = cardDi(html, s);
    expect(card).toMatch(/\d+° percentile/);
    expect(card).toContain("Cambia in media");
  });

  it("solo l'S&P 500 porta il badge, pur avendo dati identici in forma agli altri", () => {
    expect(cardDi(html, "SP500")).toContain("contesto macro");
    expect(cardDi(html, "XAUUSD")).not.toContain("contesto macro");
    expect(cardDi(html, "WTICOUSD")).not.toContain("contesto macro");
  });
});

describe("TermometroVolatilita — degradi", () => {
  it("senza chiusure mostra la percentuale invece della valuta", () => {
    const html = resa({ SP500: { iv: 20 } });
    expect(html).toContain("chiusura di ieri non disponibile");
    expect(html).not.toContain("punti indice");
  });

  it("con una chiusura implausibile lo dichiara invece di mostrare una cifra sbagliata", () => {
    const html = resa({ SP500: { iv: 20, close: 750900 } });
    expect(html).toContain("fuori dalla banda di plausibilità");
  });

  it("senza nessun ingresso degrada a un messaggio unico, senza lanciare", () => {
    const html = resa({});
    expect(html).toContain("non disponibile");
    expect(html).not.toContain("banda 25-75%");
  });
});
