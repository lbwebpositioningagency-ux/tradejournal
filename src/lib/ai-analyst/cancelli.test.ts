import { describe, expect, it, vi } from "vitest";
import {
  DOMANDA_DIREZIONE,
  DOMANDA_OPERATIVA,
  cancelloSemanticoAnalyst,
  controlloLessicaleAnalyst,
} from "@/lib/ai-analyst/cancelli";

/* ── cancello 1: lessicale ───────────────────────────────────────────── */

/**
 * ESCHE che il cancello lessicale DEVE fermare. Non sono casi facili di
 * proposito: qualcuno è in inglese, qualcuno usa il gergo tecnico invece della
 * direzione esplicita, qualcuno è la cronaca di prezzo travestita da analisi.
 */
const ESCHE_LESSICALI: ReadonlyArray<[string, string]> = [
  ["bias esplicito", "Il quadro di fondo resta rialzista sull'oro."],
  ["bias esplicito al contrario", "Impostazione ribassista sul petrolio."],
  ["inglese", "The setup remains bullish for gold this week."],
  ["previsione dichiarata", "Si prevede una giornata di espansione."],
  ["previsione mascherata", "Ci si attende un'escursione più ampia della norma."],
  ["aspettativa", "Le aspettative sono per un mercato più mosso."],
  ["modale + direzione", "Il petrolio potrebbe salire se le scorte calano."],
  ["destinato a", "L'oro è destinato a salire con i reali in discesa."],
  ["futuro sul prezzo", "L'indice raggiungerà i massimi di periodo."],
  ["vedremo", "Vedremo un mercato più mosso nel pomeriggio."],
  ["invito operativo", "Chi opera potrebbe valutare di comprare sui ritracciamenti."],
  ["invito operativo 2", "Meglio vendere forza su questi valori."],
  ["gergo operativo", "Nessuna opportunità sul long in questa fase."],
  ["obiettivo di prezzo", "Il target dei 4.000 dollari resta valido."],
  ["livello tecnico", "Il livello chiave da guardare è 3.900."],
  ["tenuta di quota", "Conta la tenuta dei 3.900 dollari."],
  ["probabilità inventata", "C'è il 71% di probabilità che la giornata sia ampia."],
  ["parola vietata: probabilità", "La probabilità di un'escursione ampia è alta."],
  ["parola vietata: affidabilità", "L'affidabilità di questa lettura è alta."],
  ["parola vietata: previsione", "Questa previsione vale per la seduta."],
  ["parola vietata: segnale", "Il segnale del termometro è chiaro."],
  ["parola vietata: edge", "Qui c'è un edge misurabile."],
  ["parola vietata: hit rate", "L'hit rate storico è del 71%."],
  ["gergo statistico: percentile", "Il percentile del VIX è 24."],
  ["gergo statistico: correlazione", "La correlazione con i reali è −0,8."],
  ["gergo statistico: z-score", "Lo z-score del livello è 1,4."],
  ["gergo statistico: deviazione standard", "La deviazione standard è 4,2 punti."],
  ["gergo statistico: expected move", "L'expected move settimanale è 2,1%."],
  ["giudizio di merito", "Giornata favorevole per l'oro."],
  ["giudizio di merito 2", "Il contesto è positivo per gli indici."],
  ["giudizio di merito 3", "Quadro molto negativo sul comparto."],
  ["colore come giudizio", "In verde il comparto energia."],
  ["orizzonte futuro", "Domani il mercato sarà più mosso."],
  ["orizzonte futuro 2", "Nelle prossime ore le condizioni cambieranno."],
  ["cronaca di prezzo", "L'oro crolla dopo il dato sull'inflazione."],
  ["cronaca di prezzo 2", "Il petrolio sale del 3% in avvio."],
  ["outlook inglese", "Outlook: expansion likely."],
  ["forecast inglese", "Forecast for the session: wider range."],
  ["price target inglese", "Price target at 4.100."],
  ["domanda speculativa", "Può l'oro reggere questi valori?"],
  ["direzione al rialzo", "Impostazione al rialzo sul metallo."],
  ["verso l'alto", "Il movimento punta verso l'alto."],
];

describe("cancello lessicale — esche che devono essere fermate", () => {
  for (const [etichetta, testo] of ESCHE_LESSICALI) {
    it(`ferma: ${etichetta}`, () => {
      const violazioni = controlloLessicaleAnalyst(testo);
      expect(violazioni.length).toBeGreaterThan(0);
    });
  }
});

/**
 * ESCHE RACCOLTE DAL VERO — frasi che Gemini ha davvero prodotto nel primo
 * giro con la chiave vera (09/08/2026), copiate verbatim dall'output. Non
 * sono inventate: sono il buco osservato.
 *
 * Il modello cita gli identificatori INTERNI dei fattori («F5 e F6», «F4 e
 * F9») dentro il testo che va a schermo. Non è linguaggio direzionale, ma è
 * comunque roba che non deve arrivare a chi legge: quegli id sono la nostra
 * impalcatura, per l'utente non vogliono dire niente e fanno sembrare la
 * sezione un pannello di debug.
 */
const ESCHE_DAL_VERO: ReadonlyArray<[string, string]> = [
  [
    "id interni dei fattori (F5 e F6) — osservata il 09/08/2026",
    "Alcuni dati sui fattori F5 e F6 risultano invecchiati essendo stati rilevati il 2026-07-21.",
  ],
  [
    "id interni dei fattori (F4 e F9) — osservata il 09/08/2026",
    "Il dato sulla volatilità implicita di F4 e F9 fa riferimento a un indice di un altro mercato.",
  ],
  [
    "id interno singolo",
    "Il fattore F1 non è disponibile in questa lettura.",
  ],
  [
    "id interno a due cifre",
    "Anche F10 e F12 poggiano su rilevazioni più vecchie.",
  ],
];

describe("cancello lessicale — esche raccolte dalla prosa vera del modello", () => {
  for (const [etichetta, testo] of ESCHE_DAL_VERO) {
    it(`ferma: ${etichetta}`, () => {
      expect(controlloLessicaleAnalyst(testo).length).toBeGreaterThan(0);
    });
  }

  it("non confonde con gli id un testo che parla di numeri o sigle vere", () => {
    // Falsi positivi da evitare: qui non c'è nessun identificatore interno.
    for (const buono of [
      "Il GVZ sta a 24,86 e il VIX a 15,15.",
      "Il campione copre 20 anni, dal 2006 al 2025.",
      "La fascia va da F a G nella scala della fonte.",
      "Nel 2026 la finestra si allarga.",
    ]) {
      expect(controlloLessicaleAnalyst(buono), buono).toEqual([]);
    }
  });
});

/**
 * TESTI PULITI che devono passare: se il cancello li fermasse, la sezione non
 * potrebbe dire nemmeno le cose che ha il diritto di dire.
 */
const TESTI_PULITI: ReadonlyArray<[string, string]> = [
  [
    "stato del termometro",
    "Il GVZ, che misura quanto costa coprirsi sull'oro, sta a 25,37: più in alto che nel 88% delle sedute del periodo 2008 → 2026. Il termometro classifica la condizione come espansa.",
  ],
  [
    "ampiezza abituale",
    "Nelle giornate con questa condizione, l'oro ha percorso dal minimo al massimo circa l'1,61% del proprio valore, cioè circa 64,40 $.",
  ],
  [
    "quota con base rate",
    "Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 55% di una giornata qualsiasi: 19,7 punti di differenza, misurati su 570 giornate.",
  ],
  [
    "posizione storica",
    "I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017.",
  ],
  [
    "dispersione stagionale",
    "Nel mese di agosto, negli ultimi 20 anni, i rendimenti dell'oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto.",
  ],
  [
    "limite fisso",
    "Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.",
  ],
  [
    "limite fisso 2",
    "Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.",
  ],
  [
    "dati insufficienti",
    "Oggi su questo strumento non c'è abbastanza materiale per una lettura del carattere della giornata.",
  ],
];

describe("cancello lessicale — testi puliti che devono passare", () => {
  for (const [etichetta, testo] of TESTI_PULITI) {
    it(`lascia passare: ${etichetta}`, () => {
      expect(controlloLessicaleAnalyst(testo)).toEqual([]);
    });
  }
});

/**
 * Il limite DICHIARATO del cancello lessicale: la direzione insinuata senza
 * nessuna delle parole vietate gli passa davanti. È esattamente il motivo per
 * cui esiste il secondo cancello, e non un difetto nascosto — questi stessi
 * testi sono fermati nel percorso completo (vedi sintesi.test.ts).
 */
const ESCHE_SOLO_SEMANTICHE: ReadonlyArray<[string, string]> = [
  ["spazio sopra", "Il metallo ha più spazio sopra di sé che sotto."],
  ["chi è entrato", "Chi è entrato la settimana scorsa ha ancora margine davanti."],
  ["pende da una parte", "Il quadro nel suo insieme pende tutto da una parte sola."],
  ["alleggerire", "Il termometro suggerisce di alleggerire l'esposizione."],
  ["asimmetria", "L'asimmetria fra i due lati del mercato è evidente e non è simmetrica."],
];

describe("cancello lessicale — limite dichiarato", () => {
  for (const [etichetta, testo] of ESCHE_SOLO_SEMANTICHE) {
    it(`non basta da solo su: ${etichetta}`, () => {
      // Documenta il confine: qui il primo cancello non ha appigli lessicali,
      // e il lavoro tocca al secondo.
      expect(controlloLessicaleAnalyst(testo)).toEqual([]);
    });
  }
});

/* ── cancello 2: semantico ───────────────────────────────────────────── */

/** Giudice finto con firma esplicita: la stessa che il cancello si aspetta. */
function risponditore(risposta: string) {
  return vi.fn<(domanda: string, testo: string) => Promise<string>>(
    async () => risposta,
  );
}

describe("cancello semantico", () => {
  it("pone entrambe le domande, nell'ordine", async () => {
    const chiedi = risponditore("no");
    const esito = await cancelloSemanticoAnalyst(chiedi, "testo qualunque");
    expect(esito.bloccato).toBe(false);
    expect(chiedi).toHaveBeenCalledTimes(2);
    expect(chiedi.mock.calls[0][0]).toBe(DOMANDA_DIREZIONE);
    expect(chiedi.mock.calls[1][0]).toBe(DOMANDA_OPERATIVA);
  });

  it("blocca su «sì» alla prima domanda, senza porre la seconda", async () => {
    const chiedi = risponditore("sì");
    const esito = await cancelloSemanticoAnalyst(chiedi, "testo");
    expect(esito.bloccato).toBe(true);
    expect(chiedi).toHaveBeenCalledTimes(1);
  });

  it("blocca quando solo la seconda domanda dice di sì", async () => {
    const chiedi = vi
      .fn()
      .mockResolvedValueOnce("no")
      .mockResolvedValueOnce("Sì, contiene un suggerimento.");
    const esito = await cancelloSemanticoAnalyst(chiedi, "testo");
    expect(esito.bloccato).toBe(true);
    expect(esito.motivo).toContain("suggerimento op");
  });

  it("è fail-closed: ambiguità, vuoto ed errore bloccano tutti", async () => {
    for (const risposta of ["forse", "", "   ", "non saprei", "Yes", "1"]) {
      const esito = await cancelloSemanticoAnalyst(async () => risposta, "t");
      expect(esito.bloccato).toBe(true);
    }
    const esitoErrore = await cancelloSemanticoAnalyst(async () => {
      throw new Error("429 quota esaurita");
    }, "t");
    expect(esitoErrore.bloccato).toBe(true);
    expect(esitoErrore.motivo).toContain("429");
  });

  it("accetta un «no» anche con punteggiatura o virgolette attorno", async () => {
    for (const risposta of ["no", "No.", '"no"', "  no, non lo fa", "«no»"]) {
      const esito = await cancelloSemanticoAnalyst(async () => risposta, "t");
      expect(esito.bloccato).toBe(false);
    }
  });

  it("passa al modello il testo da giudicare, non altro", async () => {
    const chiedi = risponditore("no");
    await cancelloSemanticoAnalyst(chiedi, "IL TESTO DA GIUDICARE");
    expect(chiedi.mock.calls[0][1]).toBe("IL TESTO DA GIUDICARE");
    expect(chiedi.mock.calls[1][1]).toBe("IL TESTO DA GIUDICARE");
  });
});
