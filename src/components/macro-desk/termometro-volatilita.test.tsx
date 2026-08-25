import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TermometroVolatilita, type CancelloPerSimbolo } from "./termometro-volatilita";
import { valutaCancello } from "@/lib/termometro-cancello";
import type { IngressoTermometro } from "@/lib/termometro-volatilita";

/**
 * Rendering del termometro (renderToStaticMarkup, senza DOM), come per gli
 * altri pannelli del desk.
 *
 * La proprietà che questo file tiene ferma è quella nuova, e la più importante:
 * **il verdetto compare solo dove il cancello è aperto**. Dove è chiuso lo
 * strumento non ha una carta, ha una riga che dice perché — mai un silenzio, e
 * mai una classificazione senza le sue condizioni.
 */

const INGRESSI_COMPLETI: Record<string, IngressoTermometro> = {
  XAUUSD: { iv: 24.3, close: 4076.4 },
  WTICOUSD: { iv: 60.62, close: 64.93 },
  SP500: { iv: 20, close: 7509 },
};

/** Cancello APERTO per i simboli elencati, chiuso per gli altri. */
function cancelli(
  aperti: string[],
  chiusi: Record<string, CancelloPerSimbolo> = {},
): Record<string, CancelloPerSimbolo> {
  const fuori: Record<string, CancelloPerSimbolo> = { ...chiusi };
  for (const s of aperti) {
    fuori[s] = {
      esito: {
        aperto: true,
        motivo: null,
        // Prova vera per lo stato ESPANSA dell'S&P: non un numero inventato.
        validazione: { guadagnoPp: 27.7, n: 101, periodoDa: "2025-07-30", periodoA: "2026-07-29", passa: true },
      },
    };
  }
  return fuori;
}

function resa(
  ingressi: Record<string, IngressoTermometro>,
  porte: Record<string, CancelloPerSimbolo>,
) {
  return renderToStaticMarkup(
    <TermometroVolatilita ingressi={ingressi} cancelli={porte} />,
  );
}

/**
 * Isola il markup della card di uno strumento. Si divide sui confini reali
 * delle card (ogni card apre con `<div class="md-card`): una finestra a
 * larghezza fissa sborderebbe sulle card adiacenti.
 */
function cardDi(html: string, simbolo: string) {
  const pezzi = html.split('<div class="md-card').filter((c) => c.includes(simbolo));
  expect(pezzi.length).toBeGreaterThan(0);
  return pezzi[0];
}

describe("TermometroVolatilita — il cancello decide chi ha una carta", () => {
  it("con tutti e tre aperti compaiono tre carte, il GER40 mai", () => {
    const html = resa(INGRESSI_COMPLETI, cancelli(["XAUUSD", "WTICOUSD", "SP500"]));
    for (const s of ["XAUUSD", "WTICOUSD", "SP500"]) expect(html).toContain(s);
    expect(html).not.toContain("GER40");
    expect(html.match(/banda 25-75%/g)?.length).toBe(3);
  });

  it("il caso reale al 25/08/2026: solo l'S&P 500 ha una carta", () => {
    const html = resa(
      INGRESSI_COMPLETI,
      cancelli(["SP500"], {
        XAUUSD: {
          esito: { aperto: false, motivo: "degenere", validazione: null },
          testoDegenere: "Su questo strumento il termometro non sta più distinguendo",
        },
        WTICOUSD: {
          esito: { aperto: false, motivo: "degenere", validazione: null },
          testoDegenere: "Su questo strumento il termometro non sta più distinguendo",
        },
      }),
    );
    // una sola classificazione a schermo, non tre
    expect(html.match(/banda 25-75%/g)?.length).toBe(1);
    expect(html.match(/Senza il termometro/g)?.length).toBe(1);
    // e i due esclusi sono NOMINATI, con il perché
    expect(html).toContain("Senza classificazione oggi");
    expect(html).toContain("non sta più distinguendo");
  });

  it("l'esclusione non è mai un silenzio: ogni escluso porta la propria ragione", () => {
    const html = resa(
      INGRESSI_COMPLETI,
      cancelli([], {
        XAUUSD: {
          esito: { aperto: false, motivo: "degenere", validazione: null },
          testoDegenere: "motivo dell'oro",
        },
        WTICOUSD: {
          esito: { aperto: false, motivo: "prova_non_superata", validazione: null },
          testoChiusura: "motivo del petrolio",
        },
        SP500: {
          esito: { aperto: false, motivo: "senza_prova", validazione: null },
          testoChiusura: "motivo dell'indice",
        },
      }),
    );
    expect(html).toContain("motivo dell&#x27;oro");
    expect(html).toContain("motivo del petrolio");
    expect(html).toContain("motivo dell&#x27;indice");
    // nessuna classificazione, e lo dichiara
    expect(html).not.toContain("banda 25-75%");
    expect(html).toContain("nessuno strumento ha una classificazione da mostrare");
  });

  it("un simbolo senza cancello resta fuori: assenza di verdetto non è verdetto", () => {
    const html = resa(INGRESSI_COMPLETI, {});
    expect(html).not.toContain("banda 25-75%");
    expect(html).toContain("Senza classificazione oggi");
  });
});

describe("TermometroVolatilita — cosa dichiara la carta quando c'è", () => {
  const html = resa(INGRESSI_COMPLETI, cancelli(["XAUUSD", "WTICOUSD", "SP500"]));

  it("il base rate compare sotto ogni quota", () => {
    expect(html.match(/Senza il termometro/g)?.length).toBe(3);
  });

  it("la n della cella è sempre dichiarata", () => {
    expect(html.match(/\(n=\d+\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("dichiara la finestra di riferimento di ogni strumento", () => {
    expect(html).toContain("rif. 2008-2026");
    expect(html).toContain("rif. 2007-2026");
    expect(html).toContain("rif. 2000-2026");
  });

  it("dichiara la prova fuori campione che tiene aperto il cancello", () => {
    expect(html).toContain("Validato su dati mai visti");
    expect(html).toContain("punti percentuali");
    expect(html).toContain("30/07/2025");
  });

  it("dichiara che serve a dimensionare, non a scegliere una direzione", () => {
    expect(html).toContain("dimensionare stop e size");
    expect(html).toContain("mai in che direzione va il prezzo");
    expect(html.toLowerCase()).not.toContain("edge");
  });

  it("dichiara l'età della taratura quando le viene data", () => {
    const conCalibrazione = renderToStaticMarkup(
      <TermometroVolatilita
        ingressi={INGRESSI_COMPLETI}
        cancelli={cancelli(["SP500"])}
        calibrazione={{
          generatoIl: "2026-07-29",
          prossimoRicalcolo: "2027-01-29",
          giorniDallaTaratura: 27,
        }}
      />,
    );
    expect(conCalibrazione).toContain("tarata il");
    expect(conCalibrazione).toContain("27 giorni fa");
  });
});

describe("TermometroVolatilita — l'S&P 500 è solo contesto macro", () => {
  const html = resa(INGRESSI_COMPLETI, cancelli(["XAUUSD", "WTICOUSD", "SP500"]));
  const cardSp = cardDi(html, "SP500");

  it("la carta dell'S&P 500 porta il badge di contesto macro", () => {
    expect(cardSp).toContain("contesto macro");
  });

  it("il badge compare una volta sola in tutta la sezione", () => {
    expect(html.match(/contesto macro/g)?.length).toBe(1);
  });

  it("mostra un percentile puntuale e la durata media dello stato", () => {
    expect(cardSp).toMatch(/\d+° percentile/);
    expect(cardSp).toContain("Cambia in media");
  });

  it("mostra l'ampiezza in punti indice quando la chiusura è plausibile", () => {
    expect(cardSp).toContain("punti indice");
  });
});

describe("TermometroVolatilita — degradi", () => {
  it("senza chiusura mostra la percentuale invece della valuta", () => {
    const html = resa({ SP500: { iv: 20 } }, cancelli(["SP500"]));
    expect(html).toContain("chiusura di ieri non disponibile");
    expect(html).not.toContain("punti indice");
  });

  it("con una chiusura implausibile lo dichiara invece di una cifra sbagliata", () => {
    const html = resa({ SP500: { iv: 20, close: 750900 } }, cancelli(["SP500"]));
    expect(html).toContain("fuori dalla banda di plausibilità");
  });

  it("senza nessun ingresso non lancia e non mostra classificazioni", () => {
    const html = resa({}, {});
    expect(html).not.toContain("banda 25-75%");
    expect(html).toContain("Senza classificazione oggi");
  });

  it("il GER40 resta nascosto anche se gli si fornisce un ingresso e un cancello aperto", () => {
    const html = resa(
      { ...INGRESSI_COMPLETI, GER40: { iv: 25, close: 20000 } },
      cancelli(["XAUUSD", "WTICOUSD", "SP500", "GER40"]),
    );
    expect(html).not.toContain("GER40");
  });
});

describe("valutaCancello — la regola, non l'elenco dei simboli", () => {
  it("apre dove la prova fuori campione supera la soglia e il gruppo esiste ancora", () => {
    const e = valutaCancello("SP500", "ESPANSA", true);
    expect(e.aperto).toBe(true);
    expect(e.validazione?.guadagnoPp).toBeGreaterThanOrEqual(15);
  });

  it("chiude se il classificatore è degenerato, anche con la prova superata", () => {
    const e = valutaCancello("SP500", "ESPANSA", false);
    expect(e.aperto).toBe(false);
    expect(e.motivo).toBe("degenere");
  });

  it("chiude sullo stato la cui prova fuori campione non arriva alla soglia", () => {
    // ORO, stato ESPANSA: 5,3 pp fuori campione contro i 15 richiesti
    const e = valutaCancello("XAUUSD", "ESPANSA", true);
    expect(e.aperto).toBe(false);
    expect(e.motivo).toBe("prova_non_superata");
    expect(e.validazione?.guadagnoPp).toBeLessThan(15);
  });

  it("è per STATO, non per strumento: lo stesso oro passa da COMPRESSA", () => {
    expect(valutaCancello("XAUUSD", "COMPRESSA", true).aperto).toBe(true);
  });

  it("uno strumento senza prova in tabella non apre", () => {
    const e = valutaCancello("NON_ESISTE", "ESPANSA", true);
    expect(e.aperto).toBe(false);
    expect(e.motivo).toBe("senza_prova");
  });
});
