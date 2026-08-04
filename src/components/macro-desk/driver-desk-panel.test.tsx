import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { DriverDeskSeries } from "@/generated/prisma/client";
import { composeAllCards } from "@/lib/driver-desk/cards";
import type { SeriesObs } from "@/lib/driver-desk/engine";
import type { DriverDeskData } from "@/lib/queries/driver-desk";
import { DriverDeskPanel } from "./driver-desk-panel";

/**
 * Rendering del pannello Driver Desk (renderToStaticMarkup, senza DOM),
 * stessa disciplina del pannello COT e del termometro. I vincoli centrali:
 * - ASSENZA di linguaggio predittivo e di gergo statistico a schermo;
 * - NIENTE verde/rosso (riservati al P&L);
 * - NESSUN messaggio che dichiari un componente mancante: chi non c'è
 *   semplicemente non compare;
 * - la legenda esplicativa c'è, è aperta, e spiega la direzione dei driver.
 */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function weekdayDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2024-01-01T00:00:00Z");
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const DATES = weekdayDates(600);

function priceSeries(seed: number, base: number): SeriesObs[] {
  const rnd = lcg(seed);
  let level = base;
  return DATES.map((date) => {
    level *= 1 + (rnd() - 0.5) / 60;
    return { date, value: level };
  });
}

function yieldSeries(seed: number, base: number): SeriesObs[] {
  const rnd = lcg(seed);
  let level = base;
  return DATES.map((date) => {
    level += (rnd() - 0.5) / 12;
    return { date, value: level };
  });
}

const SERIES: Partial<Record<DriverDeskSeries, SeriesObs[]>> = {
  XAUUSD: priceSeries(1, 2000),
  XAGUSD: priceSeries(2, 25),
  WTI: priceSeries(3, 80),
  BRENT: priceSeries(4, 84),
  GER40: priceSeries(5, 18000),
  STOXX50E: priceSeries(6, 4900),
  CAC40: priceSeries(7, 7800),
  SPX: priceSeries(8, 5000),
  DFII10: yieldSeries(9, 2),
  T10YIE: yieldSeries(10, 2.3),
  DTWEXBGS: priceSeries(11, 120),
  EURUSD: priceSeries(12, 1.08),
  BUND10Y: yieldSeries(13, 2.5),
};

function buildData(
  series: Partial<Record<DriverDeskSeries, SeriesObs[]>> = SERIES,
): DriverDeskData {
  const { cards, errors } = composeAllCards(series);
  return {
    cards,
    errors,
    coverage: [
      {
        series: "XAUUSD",
        source: "Dukascopy xauusd",
        lastDate: DATES.at(-1) ?? null,
        rows: DATES.length,
        note: null,
        updatedAt: "2026-08-04T07:00:00.000Z",
      },
    ],
    empty: false,
  };
}

const html = renderToStaticMarkup(<DriverDeskPanel data={buildData()} />);

describe("DriverDeskPanel — parole vietate", () => {
  // Lessico predittivo e direzionale: il modulo è descrittivo per contratto.
  it.each([
    "hit rate",
    "probabilit",
    "affidabilit",
    "prevision",
    "prevede",
    "predi",
    "percentile",
    "edge",
    "segnale",
    "rialzo",
    "ribasso",
    "salirà",
    "scender",
    "comprare",
    "vendere",
  ])("il markup non contiene '%s'", (parola) => {
    expect(html.toLowerCase()).not.toContain(parola);
  });
});

describe("DriverDeskPanel — niente verde/rosso", () => {
  it.each(["text-profit", "text-loss", "--md-up", "--md-down"])(
    "il markup non usa '%s' (riservato al P&L)",
    (token) => {
      expect(html).not.toContain(token);
    },
  );
});

describe("DriverDeskPanel — nessun messaggio di assenza", () => {
  it.each([
    "assente",
    "non disponibil",
    "mancante",
    "nessuna fonte",
    "escluso",
  ])("il markup non contiene '%s'", (parola) => {
    expect(html.toLowerCase()).not.toContain(parola);
  });

  it("il rame non è nominato in nessun modo", () => {
    expect(html.toLowerCase()).not.toContain("rame");
  });

  it("una scheda che non si può comporre sparisce, senza banner al suo posto", () => {
    const series = { ...SERIES };
    delete series.GER40;
    const markup = renderToStaticMarkup(
      <DriverDeskPanel data={buildData(series)} />,
    );
    expect(markup).not.toContain("GER40");
    expect(markup.toLowerCase()).not.toContain("scheda dax");
    // le altre due restano
    expect(markup).toContain("XAU/USD");
    expect(markup).toContain("WTI");
  });
});

describe("DriverDeskPanel — legenda esplicativa", () => {
  it("è presente e aperta di default", () => {
    expect(html).toContain("Come si legge questa pagina");
    expect(html).toMatch(/<details[^>]*\sopen/);
  });

  it("dichiara che non è una previsione né un'indicazione operativa", () => {
    expect(html).toContain("non dice dove andrà il prezzo");
    expect(html).toContain("nessuna indicazione operativa");
  });

  it("spiega che le linee non sono prezzi e cosa vuol dire stare più in alto", () => {
    expect(html).toContain("non sono");
    expect(html).toContain("in rapporto alla propria storia");
    expect(html).toContain("dodici mesi");
  });

  it("R7: il blocco generale NON elenca più i driver — la chiave è per scheda", () => {
    expect(html).not.toContain("Cosa vuol dire che un driver sale");
    // il blocco generale rimanda alle chiavi di lettura sopra i grafici
    expect(html).toContain("chiave di lettura sopra ciascun grafico");
  });

  it("dichiara che nessun driver è invertito di segno", () => {
    expect(html).toContain("segno invertito");
  });

  it("spiega a cosa serve il blocco sotto il grafico", () => {
    expect(html).toContain("quando smettere di fidarsi di un riferimento");
  });

  it("dichiara che il blocco copre OGNI linea, paniere incluso", () => {
    expect(html).toContain("una voce per ogni linea del grafico");
    expect(html).toContain("pari di paniere");
  });
});

describe("DriverDeskPanel — chiave di lettura per scheda (R7)", () => {
  it("ogni scheda ha il suo blocco «Chiave di lettura»", () => {
    expect(html.split("Chiave di lettura").length - 1).toBe(3);
  });

  it("le voci coprono i componenti di ogni scheda", () => {
    for (const atteso of [
      "Rendimento reale USA 10Y",
      "Breakeven inflazione 10Y",
      "Dollar index (broad)",
      "Spread WTI",
      "EURUSD",
      "Bund 10Y",
      "Paniere azionario",
    ]) {
      expect(html).toContain(atteso);
    }
  });

  it("framing OBBLIGATORIO: tendenza storica, mai regola fissa", () => {
    // le frasi direzionali usano «storicamente», mai la freccia certa
    expect(html).toContain("storicamente, un dollaro più forte è stato un contesto meno favorevole");
    expect(html).toContain("storicamente si muove nella stessa direzione dell&#x27;oro");
    expect(html).not.toMatch(/sale\s*(→|=&gt;)/);
  });

  it("ogni blocco rimanda alla stabilità per lo stato ATTUALE del legame", () => {
    const rimandi = html.split("il blocco «Stabilità").length - 1;
    expect(rimandi).toBe(3);
    expect(html).toContain("mai regole fisse");
  });

  it("oro-dollaro: l'indebolimento recente del legame è dichiarato", () => {
    expect(html).toContain("il legame si è indebolito negli ultimi anni");
    expect(html).toContain("de-dollarizzazione");
  });

  it("Bund: nessun segno pulito inventato — l'ambiguità è detta com'è", () => {
    expect(html).toContain("non esiste una direzione storica netta");
    expect(html).toContain("a volte");
  });

  it("scheda degradata: la voce del componente assente sparisce dalla chiave", () => {
    const series = { ...SERIES };
    delete series.BRENT; // decade anche lo spread
    const markup = renderToStaticMarkup(
      <DriverDeskPanel data={buildData(series)} />,
    );
    const schedaWti = markup.split("Petrolio WTI")[1]?.split("Chiave di lettura")[1] ?? "";
    expect(schedaWti).not.toContain("Brent");
  });
});

describe("DriverDeskPanel — schede", () => {
  it("le tre schede ci sono, con la storia comune dichiarata", () => {
    for (const ticker of ["XAU/USD", "WTI", "GER40"]) {
      expect(html).toContain(ticker);
    }
    expect(html).toContain("storia comune");
  });

  it("la legenda cliccabile del grafico ha un pulsante per componente", () => {
    // l'asset dell'oro + i suoi quattro componenti
    for (const label of [
      "Argento",
      "Rendimento reale USA 10Y",
      "Dollar index (broad)",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-pressed="true"');
  });

  it("il blocco di stabilità resta, col segno osservato", () => {
    expect(html).toContain("Stabilità delle relazioni");
    expect(html).toContain("correlazione osservata");
  });

  it("la stabilità copre anche il paniere: singoli per oro/WTI, combinato per il DAX", () => {
    // «La relazione con X» è la frase che esiste SOLO nelle voci di stabilità
    for (const atteso of ["Argento", "Brent", "Paniere azionario"]) {
      expect(html).toContain(`La relazione con ${atteso}`);
    }
  });

  it("R6: il DAX ha UNA linea di paniere, non tre voci separate nella stabilità", () => {
    // i tre indici non hanno più una voce propria («La relazione con …»):
    // restano nominati solo nella chiave di lettura del paniere combinato
    expect(html).not.toContain("La relazione con Euro Stoxx 50");
    expect(html).not.toContain("La relazione con CAC 40");
    expect(html).not.toContain("La relazione con S&amp;P 500");
  });

  it("R6: la legenda dichiara le due scale indipendenti", () => {
    expect(html).toContain("Le due scale sono indipendenti");
    expect(html).toContain("NON è confrontabile direttamente");
  });
});

describe("DriverDeskPanel — modulo senza dati", () => {
  it("dichiara solo che la tabella è vuota, non un componente mancante", () => {
    const vuoto = renderToStaticMarkup(
      <DriverDeskPanel
        data={{ cards: [], errors: [], coverage: [], empty: true }}
      />,
    );
    expect(vuoto).toContain("nessuna serie in tabella");
  });
});
