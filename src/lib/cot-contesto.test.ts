import { describe, expect, it } from "vitest";

import {
  controlloLessicale,
  IMPLICAZIONI_MECCANICHE,
  rispostaSemanticaBlocca,
} from "./cot-contesto";

/**
 * Cancelli sul linguaggio e tabella delle implicazioni meccaniche.
 *
 * Il 26/08/2026 da questo file sono usciti i test del percorso "notizie"
 * (parser RSS, selezione dei titoli, pipeline settimanale, schema del
 * contenuto salvato) insieme al percorso stesso: il pannello COT non
 * pubblica più titoli presi da Google News. Il vincolo centrale resta ed è
 * anzi l'unico motivo per cui questi cancelli continuano a esistere: nessuna
 * aspettativa di direzione del prezzo a schermo, mai — e vale ora anche per
 * la Sintesi, che li riusa.
 */


/* ── cancello 1: lessicale ──────────────────────────────────────────── */

describe("controlloLessicale — frasi di aspettativa direzionale", () => {
  it.each([
    "mi aspetto un recupero del prezzo",
    "le aspettative degli operatori",
    "probabilmente il mercato reagirà",
    "un contesto rialzista per l'oro",
    "pressione ribassista sul greggio",
    "sentiment bullish tra i gestori",
    "Gold Price Forecast: Fed Decision in Focus",
    "Q3 Commodity Outlook di una banca",
    "Analysts predict record highs",
    "Oil could surge on supply fears",
    "Gold set to rise after Fed pause",
    "Crude expected to fall this quarter",
    "il prezzo salirà nelle prossime settimane",
    "la domanda aumenterà in autunno",
    "potrebbe salire ancora",
    "dovrebbero scendere le quotazioni",
    "vedremo nuovi massimi",
    "andrà incontro a una correzione",
    "target a 4.000 dollari",
    "price target raised",
    "conviene comprare sui ribassi",
    "time to buy gold?",
    "impostare uno stop loss stretto",
    "I futures sull'oro salgono dell'1,58% e interrompono due sessioni di cali",
    "Futures sul greggio crollano, ma restano i rischi",
    "il petrolio balza dopo l'annuncio",
    "gold surges to record on haven demand",
    "Usa, scorte petrolio settimanali aumentano contro le attese",
    "Oro: fondamentale la tenuta dei 4.000 dollari",
    "il supporto in area 60 dollari",
    "prima resistenza a quota 95",
    "Possono i futures reggere mentre aumentano i rischi?",
    "i lingotti hanno subito un forte calo",
    "i lingotti salgono vertiginosamente",
    "greggio in picchiata dopo l'annuncio",
  ])("blocca: %s", (frase) => {
    expect(controlloLessicale(frase).length).toBeGreaterThan(0);
  });

  it.each([
    "previsione degli analisti",
    "le scorte calano più bruscamente del previsto",
    "come previsto dagli analisti",
    "alta probabilità di successo",
    "il segnale è chiaro",
    "87° percentile della distribuzione",
    "hit rate del 70%",
    "un edge statistico",
  ])("blocca anche le parole già vietate nel pannello: %s", (frase) => {
    expect(controlloLessicale(frase).length).toBeGreaterThan(0);
  });

  it.each([
    "gli ETF sull'oro hanno registrato afflussi record a luglio",
    "l'OPEC+ ha aumentato la produzione di 548.000 barili al giorno",
    "l'open interest è sceso durante il rollover trimestrale dei contratti",
    "i fondi hanno ridotto le posizioni lunghe dopo i dati sull'inflazione",
    "le eventuali chiusure di quelle posizioni passano per acquisti",
    "la banca centrale ha acquistato 12 tonnellate di oro a giugno",
    "Scorte USA di greggio in calo per la quarta settimana",
    "l'open interest è sceso durante il rollover dei contratti",
    "Turchia-Iraq, maxi accordo sul petrolio: un milione di barili al giorno",
  ])("NON blocca il linguaggio descrittivo al passato: %s", (frase) => {
    expect(controlloLessicale(frase)).toEqual([]);
  });
});

describe("implicazioni meccaniche — tabella statica", () => {
  it("ogni combinazione metrica × banda esiste ed è pulita per il cancello lessicale", () => {
    for (const metrica of ["mm_net", "open_interest"] as const) {
      for (const banda of ["MOLTO BASSO", "BASSO", "NELLA NORMA", "ALTO", "MOLTO ALTO"] as const) {
        const frase = IMPLICAZIONI_MECCANICHE[metrica][banda];
        expect(frase.length).toBeGreaterThan(20);
        expect(controlloLessicale(frase)).toEqual([]);
      }
    }
  });
});

/* ── cancello 2: semantico (fail-closed) ────────────────────────────── */

describe("rispostaSemanticaBlocca — passa SOLO un no esplicito", () => {
  it.each(["no", "No", "NO", "no.", " no ", "«No»", '"no"'])("lascia passare: %s", (r) => {
    expect(rispostaSemanticaBlocca(r)).toBe(false);
  });

  it.each(["sì", "si", "Sì, implica una direzione", "forse", "non saprei", "", "in parte no", "nominalmente"])(
    "blocca tutto il resto (fail-closed): %s",
    (r) => {
      expect(rispostaSemanticaBlocca(r)).toBe(true);
    },
  );
});
