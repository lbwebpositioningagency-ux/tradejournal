import { describe, expect, it } from "vitest";
import {
  perditaContinuita,
  statusPerEsito,
  verificaEsitoJob,
  type EsitoSerie,
} from "./job-esito";

/**
 * LA SENTINELLA SULLA CONTINUITÀ, scritta dopo il guasto che avrebbe dovuto
 * fermare: il 26/08/2026 la serie dell'oro è passata da 8.256 a 7.944 barre —
 * tutto il 2005 sparito — e il job è finito VERDE, perché ogni controllo che
 * esisteva guardava altrove. I numeri di questi casi sono quelli veri di quel
 * giorno: se un domani il controllo viene indebolito, a fallire è il fatto
 * storico, non un esempio inventato.
 *
 * Sta in un file suo e non in `job-esito.test.ts` perché è una sentinella
 * nuova con una sua storia: tenerla insieme la farebbe leggere come una
 * variante dei casi sull'OHLC, che sorvegliano un guasto diverso.
 */

describe("perditaContinuita", () => {
  it("una serie che cresce e non ha buchi non è una perdita", () => {
    expect(
      perditaContinuita({ primaDelGiro: 8256, dopoIlGiro: 8260, mesiPersi: [], mesiVuoti: [] }),
    ).toBeNull();
  });

  it("IL CASO DEL 26/08: la serie si accorcia e lo dice col numero esatto", () => {
    const m = perditaContinuita({
      primaDelGiro: 8256,
      dopoIlGiro: 7944,
      mesiPersi: [], mesiVuoti: [],
    });
    expect(m).toContain("8256");
    expect(m).toContain("7944");
    // La differenza è ciò che dice la portata del guasto, e va nel messaggio.
    expect(m).toContain("312");
  });

  it("un mese vuoto in mezzo è una perdita anche se il totale CRESCE", () => {
    /* Il caso più insidioso: le sedute nuove in coda coprono quelle perse in
       mezzo, e il solo conteggio non se ne accorgerebbe mai. */
    const m = perditaContinuita({
      primaDelGiro: 8256,
      dopoIlGiro: 8300,
      mesiPersi: ["2005-01", "2005-02", "2005-03"],
      mesiVuoti: ["2005-01", "2005-02", "2005-03"],
    });
    expect(m).not.toBeNull();
    expect(m).toContain("2005-01");
  });

  it("con molti mesi vuoti il messaggio non diventa un elenco illeggibile", () => {
    const dodici = Array.from(
      { length: 12 },
      (_, i) => `2005-${String(i + 1).padStart(2, "0")}`,
    );
    const m = perditaContinuita({
      primaDelGiro: 8256,
      dopoIlGiro: 8300,
      mesiPersi: dodici,
      mesiVuoti: dodici,
    });
    expect(m).toContain("12 mesi");
    expect(m).toContain("altri 9");
  });

  it("il primo giro di una serie non è una regressione", () => {
    expect(
      perditaContinuita({ primaDelGiro: 0, dopoIlGiro: 4584, mesiPersi: [], mesiVuoti: [] }),
    ).toBeNull();
  });

  it("una serie ferma sullo stesso conteggio non è una perdita", () => {
    expect(
      perditaContinuita({ primaDelGiro: 500, dopoIlGiro: 500, mesiPersi: [], mesiVuoti: [] }),
    ).toBeNull();
  });


  it("i buchi che la fonte NON HA MAI AVUTO non fanno rosso", () => {
    /* Misurato il 29/08/2026: Dukascopy non restituisce il 2002 dell'oro, e
       non l'ha mai restituito. Con la vecchia regola assoluta il cron sarebbe
       stato rosso ogni notte per un fatto del mondo — e una sentinella che
       suona sempre viene spenta. Il mese vuoto si dichiara, non fallisce. */
    expect(
      perditaContinuita({
        primaDelGiro: 7000,
        dopoIlGiro: 7540,
        mesiPersi: [],
        mesiVuoti: ["2002-01", "2002-02"],
      }),
    ).toBeNull();
  });

  it("ma un mese che PRIMA aveva sedute e ora no resta un fallimento", () => {
    const m = perditaContinuita({
      primaDelGiro: 7000,
      dopoIlGiro: 7540,
      mesiPersi: ["2022-06"],
      mesiVuoti: ["2002-01", "2022-06"],
    });
    expect(m).not.toBeNull();
    expect(m).toContain("2022-06");
    /* Il messaggio parla di ciò che si è PERSO, non dei buchi della fonte. */
    expect(m).not.toContain("2002-01");
  });
  it("senza contabilità non si inventa un verdetto", () => {
    expect(perditaContinuita(undefined)).toBeNull();
  });
});

describe("la continuità entra nella verifica di esito del job", () => {
  const conContinuita = (
    codice: string,
    continuita: EsitoSerie["continuita"],
  ): EsitoSerie => ({ codice, stato: "aggiornato", scritte: 7944, continuita });

  it("una serie «aggiornata» che si è accorciata rende il job ROSSO", () => {
    const v = verificaEsitoJob(
      ["XAUUSD"],
      [
        conContinuita("XAUUSD", {
          primaDelGiro: 8256,
          dopoIlGiro: 7944,
          mesiPersi: [], mesiVuoti: [],
        }),
      ],
    );
    expect(v.riuscito).toBe(false);
    expect(v.inErrore).toEqual(["XAUUSD"]);
    expect(statusPerEsito(v)).toBe(500);
  });

  it("il messaggio porta il motivo, non solo il codice della serie", () => {
    const v = verificaEsitoJob(
      ["XAUUSD"],
      [
        conContinuita("XAUUSD", {
          primaDelGiro: 8256,
          dopoIlGiro: 8256,
          mesiPersi: ["2005-01", "2005-02"],
          mesiVuoti: ["2005-01", "2005-02"],
        }),
      ],
    );
    expect(v.riuscito).toBe(false);
    expect(v.perditeContinuita[0]).toContain("XAUUSD");
    expect(v.messaggio).toContain("2005-01");
  });

  it("una serie sana resta verde e non finisce fra le perdite", () => {
    const v = verificaEsitoJob(
      ["XAUUSD"],
      [
        conContinuita("XAUUSD", {
          primaDelGiro: 8256,
          dopoIlGiro: 8260,
          mesiPersi: [], mesiVuoti: [],
        }),
      ],
    );
    expect(v.riuscito).toBe(true);
    expect(v.perditeContinuita).toEqual([]);
  });

  it("una serie ROTTA non viene contata fra le «invariate»", () => {
    /* Senza questo, una serie ferma e bucata sparirebbe dentro l'elenco di
       quelle legittimamente senza novità dall'upstream. */
    const v = verificaEsitoJob(
      ["XAUUSD"],
      [
        {
          codice: "XAUUSD",
          stato: "invariato",
          scritte: 0,
          continuita: {
            primaDelGiro: 8256,
            dopoIlGiro: 8256,
            mesiPersi: ["2005-06"],
            mesiVuoti: ["2005-06"],
          },
        },
      ],
    );
    expect(v.invariate).toEqual([]);
    expect(v.riuscito).toBe(false);
  });
});
