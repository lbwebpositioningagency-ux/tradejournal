import { describe, expect, it } from "vitest";
import {
  FINESTRA_CORTA,
  FINESTRA_LUNGA,
  RIGHE_SCHEDA,
  ampiezzaAttesa,
  confrontoRegime,
  delPercento,
  schedaStrumento,
  type IngressiScheda,
} from "@/lib/ai-analyst/scheda-strumento";
import type { RigaContestoVol } from "@/lib/queries/volatilita-contesto";
import type { CartaCot } from "@/lib/cot-panel";

/**
 * LE SCHEDE PER STRUMENTO.
 *
 * Il vincolo centrale, e quello che questi test difendono: OGNI RIGA È UN
 * FATTO DI MERCATO CON UN NUMERO. La tabella che c'era prima aveva colonne
 * come «2/2 misure concordi», «nessun conflitto» e «termometro non
 * disponibile» — informazioni sullo stato interno dell'app, non sul mercato —
 * e c'è un test qui sotto che vieta esplicitamente il ritorno di quel
 * linguaggio.
 *
 * I numeri dei fixture sono quelli veri del 26/08/2026 (archivio locale), così
 * un'asserzione che cambia si legge come un cambio di comportamento e non come
 * un fixture inventato che è scivolato.
 */

/* ── fixture: l'oro del 26/08/2026 ───────────────────────────────────── */

function rigaOro(over: Partial<RigaContestoVol> = {}): RigaContestoVol {
  return {
    indice: "GVZ",
    etichetta: "Oro",
    decimaliIv: 2,
    disallineamento:
      "GVZ misura la volatilità implicita delle opzioni sull'ETF GLD; la realizzata qui sotto è calcolata sullo spot XAU/USD.",
    iv: {
      livello: 27.69,
      giorno: "2026-08-25",
      etaGiorni: 2,
      rango: {
        percentile: 92.4,
        n: 4584,
        primoGiorno: "2008-06-03",
        ultimoGiorno: "2026-08-25",
        minimo: 9.7,
        massimo: 64.53,
      },
      variazioni: [
        { sedute: 5, assoluta: 1.42, relativa: 0.054, giornoBase: "2026-08-18" },
        { sedute: 20, assoluta: 3.1, relativa: 0.126, giornoBase: "2026-07-28" },
      ],
      fonte: "CBOE Global Markets",
      notaFonte: "",
      fonteUsata: "CBOE",
    },
    motivoIvAssente: null,
    prezzo: {
      livello: 4654.625,
      giorno: "2026-08-25",
      etaGiorni: 2,
      rango: null,
      variazioni: [],
      fonte: "Dukascopy",
      notaFonte: "",
      fonteUsata: "Dukascopy",
    },
    realizzata: [{ sedute: 20, annualizzata: 0.1832, n: 20 }],
    escursione: [
      { sedute: 20, mediana: 0.0194, q25: 0.0155, q75: 0.0246, massimo: 0.0361, n: 20, senzaOhlc: 0 },
      { sedute: 60, mediana: 0.0197, q25: 0.0151, q75: 0.0258, massimo: 0.0402, n: 60, senzaOhlc: 0 },
    ],
    escursioneUltima: {
      giorno: "2026-08-25",
      relativa: 0.0197,
      assoluta: 91.82,
      rango: {
        percentile: 61,
        n: 7822,
        primoGiorno: "1999-06-03",
        ultimoGiorno: "2026-08-25",
        minimo: 0.0002,
        massimo: 0.11,
      },
    },
    coperturaOhlc: { conOhlc: 7822, totali: 7944 },
    ultimaChiusura: 4654.625,
    ...over,
  };
}

const COT_ORO: CartaCot = {
  strumento: "GOLD",
  metrica: "mm_net",
  valore: 141648,
  banda: "ALTO",
  rigaPrincipale: "Più alto che nel 72% delle settimane dal 2017",
  delta4Settimane: 10882,
  aggiornatoAl: "2026-08-18",
};

function ingressiOro(over: Partial<IngressiScheda> = {}): IngressiScheda {
  return {
    strumento: "ORO",
    prezzo: rigaOro(),
    iv: rigaOro(),
    cot: [COT_ORO],
    evento: {
      nome: "CFTC · Commitments of Traders",
      quando: "28/08/2026, 21:30",
      fraQuanto: "domani",
    },
    strutturaVix: null,
    strutturaWti: null,
    oggi: "2026-08-27",
    ...over,
  };
}

/* ── ampiezza attesa ─────────────────────────────────────────────────── */

describe("ampiezzaAttesa — la sola riga che guarda avanti", () => {
  it("è la sigma di UN giorno: l'indice annuo diviso la radice di 252", () => {
    // GVZ 27,69 sull'oro a 4.654,625 il 26/08/2026
    const em = ampiezzaAttesa(27.69, 4654.625)!;
    expect(em.relativa).toBeCloseTo(0.2769 / Math.sqrt(252), 10);
    expect(em.relativa).toBeCloseTo(0.017442, 5);
    expect(em.assoluta).toBeCloseTo(81.19, 1);
  });

  it("scala linearmente col livello dell'indice, non a caso", () => {
    const a = ampiezzaAttesa(20, 100)!;
    const b = ampiezzaAttesa(40, 100)!;
    expect(b.relativa / a.relativa).toBeCloseTo(2, 10);
  });

  it("non produce numeri da ingressi che non ne hanno: null, mai zero", () => {
    expect(ampiezzaAttesa(0, 100)).toBeNull();
    expect(ampiezzaAttesa(-3, 100)).toBeNull();
    expect(ampiezzaAttesa(20, 0)).toBeNull();
    expect(ampiezzaAttesa(20, -5)).toBeNull();
    expect(ampiezzaAttesa(Number.NaN, 100)).toBeNull();
    expect(ampiezzaAttesa(20, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

/* ── due dettagli che il rendering reale ha fatto emergere ───────────── */

describe("delPercento — l'articolo si elide, e non è pignoleria", () => {
  it("elide davanti ai numeri che in italiano cominciano per vocale", () => {
    // uno, otto, undici, ottanta…: le stringhe finiscono anche negli
    // `aria-label`, e uno screen reader legge quello che c'è scritto.
    expect(delPercento(1)).toBe("dell'1%");
    expect(delPercento(8)).toBe("dell'8%");
    expect(delPercento(11)).toBe("dell'11%");
    expect(delPercento(81)).toBe("dell'81%");
    expect(delPercento(89)).toBe("dell'89%");
  });

  it("non elide dove non va: diciotto, ventotto, novanta", () => {
    expect(delPercento(18)).toBe("del 18%");
    expect(delPercento(28)).toBe("del 28%");
    expect(delPercento(90)).toBe("del 90%");
    expect(delPercento(7)).toBe("del 7%");
    expect(delPercento(92)).toBe("del 92%");
  });

  it("arrotonda prima di decidere: 80,6 è ottantuno, non ottanta virgola sei", () => {
    expect(delPercento(80.6)).toBe("dell'81%");
    expect(delPercento(79.6)).toBe("dell'80%");
    expect(delPercento(89.6)).toBe("del 90%");
  });
});

describe("confrontoRegime — una banda morta, o non dice mai «uguale»", () => {
  it("dentro il 10% relativo i due regimi sono in linea", () => {
    // il caso vero: oro 1,94% su venti sedute contro 1,97% su sessanta
    expect(confrontoRegime(0.0194, 0.0197)).toBe("in linea col trimestre");
    expect(confrontoRegime(0.01, 0.0109)).toBe("in linea col trimestre");
  });

  it("oltre la banda dichiara il verso, e il verso è quello giusto", () => {
    expect(confrontoRegime(0.02, 0.01)).toBe("regime più largo del trimestre");
    expect(confrontoRegime(0.01, 0.02)).toBe("regime più stretto del trimestre");
  });

  it("una finestra lunga a zero non produce una divisione: in linea", () => {
    expect(confrontoRegime(0.02, 0)).toBe("in linea col trimestre");
  });
});

/* ── il vincolo di contenuto ─────────────────────────────────────────── */

describe("ogni riga è un fatto di mercato, non lo stato dell'app", () => {
  const s = schedaStrumento(ingressiOro());
  const testo = s.righe
    .map((r) => `${r.misura} ${r.oggi} ${r.norma} ${r.nota ?? ""}`)
    .join(" ");

  it("nessuna riga parla di misure concordi, conflitti o segnali interni", () => {
    /* Le colonne della tabella vecchia, vietate per nome. Se una tornasse,
       tornerebbe il difetto per cui la tabella è stata rifatta. */
    for (const vietata of [
      "misure concordi",
      "nessun conflitto",
      "termometro",
      "segnale",
      "invariato",
      "copertura",
    ]) {
      expect(testo.toLowerCase()).not.toContain(vietata);
    }
  });

  it("ogni riga presente porta almeno una cifra nella colonna di oggi", () => {
    for (const r of s.righe) {
      if (r.assente) continue;
      if (r.id === "agenda") continue; // il suo numero è un tempo, non una cifra
      expect(r.oggi).toMatch(/\d/);
    }
  });

  it("mai una direzione: nessuna riga dice dove andrà il prezzo", () => {
    for (const vietata of ["salirà", "scenderà", "rialz", "ribass", "target", "compra", "vendi"]) {
      expect(testo.toLowerCase()).not.toContain(vietata);
    }
  });

  it("le righe hanno identificativi del catalogo, senza duplicati", () => {
    const ids = s.righe.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(RIGHE_SCHEDA).toContain(id);
  });
});

/* ── le due righe cardine ────────────────────────────────────────────── */

describe("le righe da cui esce la distanza dello stop", () => {
  it("sono esattamente due, e sono le prime due", () => {
    const s = schedaStrumento(ingressiOro());
    const cardini = s.righe.filter((r) => r.cardine);
    expect(cardini.map((r) => r.id)).toEqual(["ampiezza_attesa", "escursione_tipica"]);
    expect(s.righe.slice(0, 2).map((r) => r.id)).toEqual([
      "ampiezza_attesa",
      "escursione_tipica",
    ]);
  });

  it("restano cardine anche quando il dato manca: la riga non sparisce", () => {
    const s = schedaStrumento(ingressiOro({ iv: undefined, prezzo: undefined }));
    const cardini = s.righe.filter((r) => r.cardine);
    expect(cardini).toHaveLength(2);
    for (const c of cardini) {
      expect(c.assente).toBe(true);
      // dice PERCHÉ non c'è, non un trattino
      expect(c.oggi.length).toBeGreaterThan(15);
    }
  });

  it("l'ampiezza attesa dichiara di essere chiusura-chiusura, non l'escursione", () => {
    const s = schedaStrumento(ingressiOro());
    const r = s.righe.find((x) => x.id === "ampiezza_attesa")!;
    expect(r.oggi).toContain("81,19");
    expect(r.oggi).toContain("$");
    expect(r.nota).toContain("chiusura-chiusura");
    expect(r.nota).toContain("Non è l'escursione massima");
    // DUE date: l'indice e la chiusura possono venire da sedute diverse
    expect(r.norma).toBe("da GVZ 27,69 del 25/08 sulla chiusura 4654,63 del 25/08");
  });

  it("l'escursione tipica porta la cifra in valuta, la banda e il confronto a 60", () => {
    const s = schedaStrumento(ingressiOro());
    const r = s.righe.find((x) => x.id === "escursione_tipica")!;
    expect(r.misura).toContain(`${FINESTRA_CORTA} sedute`);
    expect(r.oggi).toContain("90,30 $"); // 0,0194 × 4.654,625
    expect(r.oggi).toContain("1,94%");
    expect(r.oggi).toContain("banda 1,55%–2,46%");
    expect(r.norma).toContain(`${FINESTRA_LUNGA} sedute`);
    // 1,94% contro 1,97%: dentro la banda morta, quindi «in linea» — non un
    // «regime più stretto» annunciato per tre centesimi di punto.
    expect(r.norma).toContain("in linea col trimestre");
  });
});

/* ── il resto delle righe ────────────────────────────────────────────── */

describe("le righe di contesto", () => {
  const s = schedaStrumento(ingressiOro());
  const riga = (id: string) => s.righe.find((r) => r.id === id)!;

  it("l'indice IV si legge col rango, non col livello nudo", () => {
    const r = riga("iv_livello");
    expect(r.oggi).toContain("27,69");
    expect(r.oggi).toContain("+1,42 in 5 sedute");
    expect(r.norma).toContain("più alto del 92%");
    expect(r.norma).toContain("dal 2008");
    expect(r.norma).toContain("n=4.584");
  });

  it("implicita contro realizzata: i due numeri e lo scarto, nessun verdetto", () => {
    const r = riga("iv_vs_realizzata");
    expect(r.oggi).toBe("27,7% contro 18,3%");
    expect(r.norma).toBe("scarto +9,4 punti percentuali");
    // il disallineamento GLD/spot è dichiarato, non taciuto
    expect(r.nota).toContain("GLD");
  });

  it("l'ultima seduta porta il proprio rango storico", () => {
    const r = riga("escursione_ultima");
    expect(r.oggi).toContain("91,82 $");
    expect(r.oggi).toContain("il 25/08");
    expect(r.norma).toContain("più ampia del 61%");
  });

  it("il COT è descrittivo e settimanale, e lo dichiara", () => {
    const r = riga("cot");
    expect(r.oggi).toContain("ALTO");
    expect(r.oggi).toContain("+10.882 in 4 settimane");
    expect(r.nota).toContain("nessuna conseguenza attesa sul prezzo");
  });

  it("il saldo COT porta SEMPRE il segno e la parola «netti»", () => {
    /* `mm_net` è long − short. Senza il segno un saldo corto si legge come
       lungo; senza «netti» il numero si legge come il conteggio delle
       posizioni lunghe. È la confusione per cui la sezione Posizionamento
       diceva «poche scommesse lunghe in essere» accanto a +87.479 contratti
       netti lunghi, ed è il motivo per cui quella sezione non c'è più. */
    expect(riga("cot").oggi).toContain("+141.648 contratti netti");

    const corto = schedaStrumento(
      ingressiOro({ cot: [{ ...COT_ORO, valore: -38154, banda: "MOLTO BASSO" }] }),
    ).righe.find((x) => x.id === "cot")!;
    expect(corto.oggi).toContain("−38.154 contratti netti");
  });

  it("non afferma mai quanti lunghi o quanti corti: i lordi non sono nei dati", () => {
    const testo = `${riga("cot").oggi} ${riga("cot").norma} ${riga("cot").nota}`;
    for (const vietata of ["scommesse lunghe", "posizioni lunghe", "lato corto", "da liquidare"]) {
      expect(testo.toLowerCase()).not.toContain(vietata);
    }
  });

  it("l'agenda mette la DISTANZA prima della data: è quella che decide", () => {
    const r = riga("agenda");
    expect(r.oggi.startsWith("domani ·")).toBe(true);
    expect(r.norma).toBe("28/08/2026, 21:30");
  });

  it("senza eventi lo dice, e non lascia la riga vuota", () => {
    const r = schedaStrumento(ingressiOro({ evento: null })).righe.find(
      (x) => x.id === "agenda",
    )!;
    expect(r.oggi).toContain("nessuno nei prossimi sette giorni");
    expect(r.assente).toBe(false);
  });
});

/* ── differenze fra strumenti ────────────────────────────────────────── */

describe("ogni strumento mostra quello che ha davvero", () => {
  it("l'S&P 500 DICHIARA perché non ha il COT, e ha la curva del VIX", () => {
    const s = schedaStrumento(
      ingressiOro({
        strumento: "SP500",
        cot: [],
        strutturaVix: {
          livelli: [
            { sigla: "VIX9D", valore: 13.45, giorno: "2026-08-25", etaGiorni: 2 },
            { sigla: "VIX", valore: 15.45, giorno: "2026-08-25", etaGiorni: 2 },
            { sigla: "VIX3M", valore: 18.21, giorno: "2026-08-25", etaGiorni: 2 },
          ],
          rapporti: [
            {
              corta: "VIX9D",
              lunga: "VIX",
              valoreCorta: 13.45,
              valoreLunga: 15.45,
              giorno: "2026-08-25",
              rapporto: 0.8706,
              rango: {
                percentile: 21,
                n: 3933,
                primoGiorno: "2011-01-04",
                ultimoGiorno: "2026-08-25",
                minimo: 0.4,
                massimo: 1.9,
              },
            },
          ],
          fonte: "CBOE Global Markets",
        },
      }),
    );
    const ids = s.righe.map((r) => r.id);
    /* La riga c'è, marcata assente, e dice la ragione GIUSTA: sull'S&P il
       contratto CFTC esiste (E-mini, 13874A), manca nel disaggregato. Dire
       «la CFTC non pubblica» sarebbe falso. */
    expect(ids).toContain("cot");
    const cot = s.righe.find((x) => x.id === "cot")!;
    expect(cot.assente).toBe(true);
    expect(cot.oggi).toContain("disaggregato");
    expect(cot.oggi).not.toContain("Eurex");
    expect(ids).toContain("struttura");
    const r = s.righe.find((x) => x.id === "struttura")!;
    expect(r.oggi).toContain("0,871");
    expect(r.oggi).toContain("costa meno della lunga");
  });

  it("il WTI ha la curva dei contratti, non quella del VIX", () => {
    const s = schedaStrumento(
      ingressiOro({
        strumento: "WTI",
        strutturaWti: {
          ok: true,
          struttura: {
            front: { simbolo: "CL=F", prezzo: 80.41, etichetta: "ottobre 2026" },
            secondo: { simbolo: "CLX26.NYM", prezzo: 79.9, etichetta: "novembre 2026" },
            spread: 0.51,
            spreadRelativo: 0.51 / 80.41,
            giorno: "2026-08-26",
            fonte: "Yahoo Finance",
          },
        },
      }),
    );
    const r = s.righe.find((x) => x.id === "struttura")!;
    expect(r.misura).toContain("front − secondo");
    expect(r.oggi).toContain("+0,51 $");
    expect(r.oggi).toContain("backwardation");
    expect(r.norma).toContain("ottobre 2026");
  });

  it("il DAX dichiara l'assenza strutturale del COT invece di far sparire la riga", () => {
    const s = schedaStrumento(ingressiOro({ strumento: "DAX", cot: [] }));
    const ids = s.righe.map((r) => r.id);
    expect(ids).toContain("cot");
    const cot = s.righe.find((x) => x.id === "cot")!;
    expect(cot.assente).toBe(true);
    /* La ragione, non un trattino: il DAX si tratta a Eurex e la CFTC non ha
       giurisdizione. Zero contratti '%DAX%' in tutti e tre i dataset CFTC,
       verificato il 28/08/2026. */
    expect(cot.oggi).toContain("Eurex");
    expect(cot.oggi).toContain("CFTC");
    /* Nessun numero inventato accanto all'assenza. */
    expect(cot.oggi).not.toMatch(/\d/);
    /* La curva invece resta fuori del tutto: sul DAX non esiste né un
       contratto a termine nostro né una curva di volatilità propria. */
    expect(ids).not.toContain("struttura");
  });

  it("il DAX dichiara che il suo indice IV è un sostituto, ogni volta che lo usa", () => {
    const s = schedaStrumento(ingressiOro({ strumento: "DAX", cot: [] }));
    const iv = s.righe.find((r) => r.id === "iv_livello")!;
    expect(iv.misura).toContain("sostituto");
    expect(iv.nota).toContain("un altro mercato");
  });

  it("con un indice sostitutivo NON si calcola l'ampiezza attesa, e si dice perché", () => {
    /* `chiusura × VIX/√252` sul DAX darebbe 257 punti contro un'escursione
       tipica MISURATA di 188: il 37% in più, tutto dovuto al mercato
       sbagliato. La riga resta, e resta cardine — sparire sarebbe peggio — ma
       porta il motivo al posto della cifra. */
    const s = schedaStrumento(ingressiOro({ strumento: "DAX", cot: [] }));
    const em = s.righe.find((r) => r.id === "ampiezza_attesa")!;
    expect(em.assente).toBe(true);
    expect(em.cardine).toBe(true);
    expect(em.oggi).toContain("un altro mercato non produce l'ampiezza di questo");
    expect(em.oggi).not.toMatch(/\d+\s*pt/);
  });

  it("con un sostituto nemmeno implicita contro realizzata: sarebbero due mercati", () => {
    const s = schedaStrumento(ingressiOro({ strumento: "DAX", cot: [] }));
    const r = s.righe.find((x) => x.id === "iv_vs_realizzata")!;
    expect(r.assente).toBe(true);
    expect(r.oggi).toContain("distanza fra due mercati");
  });

  it("sull'S&P 500, che il VIX ce l'ha davvero, quelle due righe ci sono", () => {
    const s = schedaStrumento(ingressiOro({ strumento: "SP500", cot: [] }));
    expect(s.righe.find((r) => r.id === "ampiezza_attesa")!.assente).toBe(false);
    expect(s.righe.find((r) => r.id === "iv_vs_realizzata")!.assente).toBe(false);
  });

  it("i prezzi si mostrano nelle unità dello strumento", () => {
    const oro = schedaStrumento(ingressiOro());
    const dax = schedaStrumento(ingressiOro({ strumento: "DAX", cot: [] }));
    expect(oro.righe.find((r) => r.id === "escursione_tipica")!.oggi).toContain("$");
    expect(dax.righe.find((r) => r.id === "escursione_tipica")!.oggi).toContain("pt");
    // il DAX si mostra a zero decimali: «90,30 pt» su un indice a 26.000 è rumore
    expect(dax.righe.find((r) => r.id === "escursione_tipica")!.oggi).toContain("90 pt");
  });
});

/* ── assenze e riga di servizio ──────────────────────────────────────── */

describe("le assenze si dichiarano, e il servizio sta in una riga sola", () => {
  it("una fonte senza massimo e minimo lo dice, invece di calcolare dalla chiusura", () => {
    const senzaOhlc = rigaOro({
      escursione: [],
      escursioneUltima: null,
      coperturaOhlc: { conOhlc: 0, totali: 10225 },
    });
    const s = schedaStrumento(ingressiOro({ prezzo: senzaOhlc }));
    const r = s.righe.find((x) => x.id === "escursione_tipica")!;
    expect(r.assente).toBe(true);
    expect(r.oggi).toContain("non pubblica massimo e minimo");
  });

  it("senza l'indice IV cadono le tre righe che ne dipendono, e solo quelle", () => {
    const s = schedaStrumento(
      ingressiOro({ iv: rigaOro({ iv: null, motivoIvAssente: "serie non presente" }) }),
    );
    const assenti = s.righe.filter((r) => r.assente).map((r) => r.id).sort();
    expect(assenti).toEqual(["ampiezza_attesa", "iv_livello", "iv_vs_realizzata"]);
    // l'escursione vera viene dal prezzo e resta
    expect(s.righe.find((r) => r.id === "escursione_tipica")!.assente).toBe(false);
  });

  it("la riga di servizio porta copertura, età del dato PIÙ VECCHIO col suo nome, campione e fonti", () => {
    const s = schedaStrumento(ingressiOro());
    /* L'oro ha 7 righe: niente curva a termine, che è del WTI e dell'S&P 500,
       e dal 28/08/2026 niente movimento chiusura-chiusura. */
    expect(s.servizio).toContain("7 misure su 7");
    // «più vecchia 9 gg» senza dire QUALE non è verificabile: il nome c'è
    expect(s.servizio).toMatch(/dato più vecchio: (GVZ|prezzo) del 25\/08 \(2 gg\)/);
    expect(s.servizio).toContain("7.822 sedute con massimo e minimo, di 7.944");
    expect(s.servizio).toContain("CBOE Global Markets");
    expect(s.servizio).toContain("Dukascopy");
  });

  it("la copertura nella riga di servizio conta le righe piene, non le totali", () => {
    const s = schedaStrumento(ingressiOro({ iv: undefined, prezzo: undefined }));
    expect(s.servizio).toMatch(/^\d misure su 7/);
    expect(s.servizio).not.toContain("7 misure su 7");
  });

  it("la seduta ancora aperta è dichiarata: la sua escursione può solo crescere", () => {
    const s = schedaStrumento(ingressiOro({ oggi: "2026-08-25" }));
    const r = s.righe.find((x) => x.id === "escursione_ultima")!;
    expect(r.nota).toContain("non è ancora chiusa");
  });
});
