import { describe, expect, it } from "vitest";
import { ordinaRighe, rigaSintesi } from "./sintesi-tabella";
import type { Dossier } from "./types";

/**
 * La tabella di sintesi decide cosa l'utente legge per primo la mattina: le
 * proprietà tenute ferme qui sono le decisioni di prodotto, non
 * l'implementazione.
 */

function dossier(over: Partial<Dossier> = {}): Dossier {
  return {
    strumento: "ORO",
    giorno: "2026-08-25",
    fattori: [
      {
        id: "F1", nome: "Volatilità implicita rispetto alla propria storia", classe: "a",
        peso: "ALTO", dataDato: "2026-08-24", giorniEta: 1,
        freschezza: "fresco", valore: { tipo: "iv" } as never,
      },
      {
        id: "F4", nome: "Indice di volatilità implicita", classe: "a",
        peso: "ALTO", dataDato: "2026-08-20", giorniEta: 5,
        freschezza: "invecchiato", valore: { tipo: "iv" } as never,
      },
    ] as Dossier["fattori"],
    assenti: [],
    attesiApplicabili: 12,
    presenti: 10,
    copertura: 10 / 12,
    datiInsufficienti: false,
    motivoInsufficienza: null,
    discordanza: false,
    termometroSenzaVerdetto: null,
    carattereAtteso: "CONDIZIONI_DI_ESPANSIONE",
    confidenza: "BUONA",
    motivoConfidenza: "fonti concordi",
    fonti: [],
    datoPiuVecchio: "2026-08-20",
    ...over,
  };
}

/**
 * Dossier con il CANCELLO CHIUSO: cade F3, la statistica condizionale. F1
 * resta fra i fattori — è il rango storico dell'indice, preso dall'archivio,
 * e non dipende dalla classificazione. Un fixture che togliesse anche F1
 * verificherebbe uno stato che `buildDossier` non produce.
 */
function senzaVerdetto(
  motivo: NonNullable<Dossier["termometroSenzaVerdetto"]> = "classificatore_degenere",
  over: Partial<Dossier> = {},
): Dossier {
  return dossier({
    termometroSenzaVerdetto: motivo,
    presenti: 11,
    copertura: 11 / 12,
    ...over,
  });
}

describe("rigaSintesi", () => {
  it("porta in tabella il carattere, non una direzione", () => {
    const r = rigaSintesi(dossier(), null);
    expect(r.carattere).toBe("Condizioni di espansione");
    // nessun campo della riga può contenere una direzione di prezzo
    expect(JSON.stringify(r)).not.toMatch(/rialzist|ribassist|compra|vendi/i);
  });

  it("la forza conta le misure DECISIVE, non tutti i fattori", () => {
    // dodici fattori attesi, ma il carattere lo decidono F1 e F4: contare
    // tutto darebbe forza alta a un segnale debole
    const r = rigaSintesi(dossier(), null);
    expect(r.forza).toEqual({ concordi: 2, disponibili: 2 });
  });

  it("in conflitto la forza scende e il conflitto è nominato", () => {
    const r = rigaSintesi(dossier({ discordanza: true }), null);
    expect(r.forza).toEqual({ concordi: 1, disponibili: 2 });
    expect(r.conflitto).not.toBeNull();
    expect(r.conflitto!.fra[0].toLowerCase()).toContain("volatilità");
    expect(r.conflitto!.spiegazione).toContain("il contrario");
  });

  it("senza ieri dice «sconosciuto», mai «invariato»", () => {
    // dichiarare una stabilità non verificata è peggio del silenzio
    expect(rigaSintesi(dossier(), null).cambiato).toBe("sconosciuto");
  });

  it("stesso dossier ieri e oggi → invariato", () => {
    expect(rigaSintesi(dossier(), dossier()).cambiato).toBe("invariato");
  });

  it("carattere cambiato → lo dice in chiaro, da cosa a cosa", () => {
    const r = rigaSintesi(
      dossier(),
      dossier({ carattereAtteso: "CONDIZIONI_DI_COMPRESSIONE" }),
    );
    expect(r.cambiato).toBe("cambiato");
    expect(r.cambiatoTesto).toContain("compressione");
    expect(r.cambiatoTesto).toContain("espansione");
  });

  it("conflitto comparso da ieri è un cambiamento", () => {
    const r = rigaSintesi(dossier({ discordanza: true }), dossier());
    expect(r.cambiato).toBe("cambiato");
    expect(r.cambiatoTesto).toContain("smesso di concordare");
  });

  it("dati diventati insufficienti → cambiamento dichiarato", () => {
    const r = rigaSintesi(
      dossier({ datiInsufficienti: true, motivoInsufficienza: "poche misure" }),
      dossier(),
    );
    expect(r.cambiato).toBe("cambiato");
    expect(r.cambiatoTesto).toContain("non bastano");
  });

  it("copertura ed età del dato arrivano in tabella", () => {
    const r = rigaSintesi(dossier(), null);
    expect(r.copertura).toEqual({ presenti: 10, attesi: 12 });
    expect(r.etaDato).toBe(5); // il dato più vecchio fra quelli usati
  });
});

describe("ordinaRighe", () => {
  const riga = (over: Partial<Dossier>, ieri: Dossier | null = dossier()) =>
    rigaSintesi(dossier(over), ieri);

  it("il conflitto viene per primo: è ciò che può far cambiare idea", () => {
    const righe = [
      riga({ strumento: "WTI" }),
      riga({ strumento: "DAX", discordanza: true }),
      riga({ strumento: "SP500", carattereAtteso: "NELLA_NORMA" }),
    ];
    expect(ordinaRighe(righe)[0].strumento).toBe("DAX");
  });

  it("poi i cambiamenti, poi il resto, e in fondo i dati insufficienti", () => {
    const righe = [
      riga({ strumento: "ORO", datiInsufficienti: true, motivoInsufficienza: "x" }, null),
      riga({ strumento: "WTI" }),
      riga({ strumento: "DAX", carattereAtteso: "NELLA_NORMA" }),
    ];
    const ordine = ordinaRighe(righe).map((r) => r.strumento);
    expect(ordine[0]).toBe("DAX"); // cambiato
    expect(ordine[2]).toBe("ORO"); // insufficiente, in fondo
  });

  it("non muta l'array ricevuto", () => {
    const righe = [riga({ strumento: "WTI" }), riga({ strumento: "DAX", discordanza: true })];
    const copia = [...righe];
    ordinaRighe(righe);
    expect(righe).toEqual(copia);
  });
});

describe("termometro senza verdetto: propagazione alla riga di sintesi", () => {
  it("la forza NON scende: le due misure decisive sono entrambe fatti", () => {
    /* Prima del 25/08/2026 il cancello chiuso faceva cadere anche F1 e con
       esso la forza, perché F1 ERA la classificazione. Ora F1 è il rango
       storico dell'indice: quello che si perde è la statistica condizionale,
       che nella forza non contava. Abbassare la forza qui sarebbe punire un
       fatto per un difetto del verdetto. */
    expect(rigaSintesi(senzaVerdetto(), null).forza).toEqual({
      concordi: 2,
      disponibili: 2,
    });
  });

  it("la riduzione non è mai silenziosa: la riga dice cosa manca e perché", () => {
    const r = rigaSintesi(senzaVerdetto(), null);
    expect(r.segnaleIncompleto).not.toBeNull();
    expect(r.segnaleIncompleto).toContain("non distingue più i due stati");
    // dice anche cosa RESTA: sparire in silenzio e sparire del tutto sono due
    // difetti diversi, e qui non deve succedere né l'uno né l'altro
    expect(r.segnaleIncompleto).toContain("non è disponibile");
    expect(r.segnaleIncompleto).toContain("restano");
  });

  it("i due motivi si distinguono a schermo: degenere ≠ non validato", () => {
    const degenere = rigaSintesi(senzaVerdetto("classificatore_degenere"), null);
    const nonValidato = rigaSintesi(senzaVerdetto("verdetto_non_validato"), null);
    expect(degenere.segnaleIncompleto).toContain("non distingue più");
    expect(nonValidato.segnaleIncompleto).toContain("prova fuori campione");
    expect(degenere.segnaleIncompleto).not.toBe(nonValidato.segnaleIncompleto);
  });

  it("segnale intero → nessuna nota, nessun rumore", () => {
    expect(rigaSintesi(dossier(), null).segnaleIncompleto).toBeNull();
  });

  it("senza verdetto E in conflitto: il conflitto conta, e la forza non va sotto zero", () => {
    const r = rigaSintesi(senzaVerdetto("classificatore_degenere", { discordanza: true }), null);
    expect(r.forza.concordi).toBeLessThanOrEqual(r.forza.disponibili);
    expect(r.forza.concordi).toBeGreaterThanOrEqual(0);
    expect(r.conflitto).not.toBeNull();
    expect(r.segnaleIncompleto).not.toBeNull();
  });

  it("il caso reale: oro e WTI senza verdetto, S&P intero", () => {
    const righe = [
      rigaSintesi(dossier({ strumento: "SP500" }), dossier({ strumento: "SP500" })),
      rigaSintesi(
        senzaVerdetto("classificatore_degenere", { strumento: "ORO" }),
        senzaVerdetto("classificatore_degenere", { strumento: "ORO" }),
      ),
      rigaSintesi(
        senzaVerdetto("classificatore_degenere", { strumento: "WTI" }),
        senzaVerdetto("classificatore_degenere", { strumento: "WTI" }),
      ),
    ];
    const conNota = righe.filter((r) => r.segnaleIncompleto).map((r) => r.strumento);
    expect(conNota).toEqual(["ORO", "WTI"]);
    // l'S&P resta intero: il verdetto è per strumento, non globale
    expect(righe[0].segnaleIncompleto).toBeNull();
  });

  it("nessuno col cancello chiuso: nessuna riga porta la nota", () => {
    const righe = ["ORO", "WTI", "SP500"].map((s) =>
      rigaSintesi(dossier({ strumento: s as never }), null),
    );
    expect(righe.every((r) => r.segnaleIncompleto === null)).toBe(true);
  });

  it("il segnale incompleto sale nell'ordine, subito dopo i conflitti", () => {
    const righe = [
      rigaSintesi(dossier({ strumento: "SP500" }), dossier({ strumento: "SP500" })),
      rigaSintesi(senzaVerdetto("classificatore_degenere", { strumento: "ORO" }), null),
      rigaSintesi(dossier({ strumento: "WTI", discordanza: true }), null),
    ];
    const ordine = ordinaRighe(righe).map((r) => r.strumento);
    expect(ordine[0]).toBe("WTI"); // conflitto
    expect(ordine[1]).toBe("ORO"); // segnale incompleto
  });
});
