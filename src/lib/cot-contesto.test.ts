import { describe, expect, it, vi } from "vitest";

import type { CartaCot } from "./cot-panel";
import {
  contenutoContestoCotSchema,
  controlloLessicale,
  DOMANDA_CANCELLO_SEMANTICO,
  eseguiPipelineContesto,
  estraiVociRss,
  IMPLICAZIONI_MECCANICHE,
  rispostaSemanticaBlocca,
  selezionaNotizie,
  urlFeedNotizie,
  type VoceRss,
} from "./cot-contesto";

/**
 * Box di contesto COT, percorso "notizie": titoli veri da RSS, zero testo
 * generato. I DUE CANCELLI PERMANENTI restano il vincolo centrale: nessuna
 * aspettativa di direzione del prezzo a schermo, mai — e se qualcosa non
 * passa, il box della settimana non viene pubblicato.
 */

/* ── fixture ────────────────────────────────────────────────────────── */

const CARTE: CartaCot[] = [
  {
    strumento: "GOLD", nomeStrumento: "ORO", metrica: "mm_net",
    etichetta: "Posizionamento speculativo", valore: 124831, posizioneBarra: 64.1,
    banda: "NELLA NORMA", rigaPrincipale: "Più alto che nel 64% delle settimane dal 2017",
    rigaRarita: null, delta4Settimane: 9436, ultimaVoltaSimile: "2026-01-06",
    aggiornatoAl: "2026-07-21",
  },
  {
    strumento: "WTI", nomeStrumento: "PETROLIO WTI", metrica: "open_interest",
    etichetta: "Partecipazione", valore: 1864487, posizioneBarra: 30.3,
    banda: "NELLA NORMA", rigaPrincipale: "Più basso che nel 70% delle settimane dal 2017",
    rigaRarita: null, delta4Settimane: -47390, ultimaVoltaSimile: "2025-12-30",
    aggiornatoAl: "2026-07-21",
  },
];

const OGGI = new Date("2026-07-31T12:00:00Z");

function itemRss(titolo: string, opzioni: { url?: string; data?: string; fonte?: string } = {}) {
  const { url = "https://news.google.com/rss/articles/abc", data = "Fri, 24 Jul 2026 10:00:00 GMT", fonte = "Reuters" } = opzioni;
  return `<item><title>${titolo} - ${fonte}</title><link>${url}</link><pubDate>${data}</pubDate><source url="https://esempio.org">${fonte}</source></item>`;
}

function feedRss(...items: string[]) {
  return `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
}

const FEED_GOLD = feedRss(
  itemRss("Le banche centrali hanno comprato 24 tonnellate di oro a giugno"),
  itemRss("Gold ETF: deflussi record dai fondi nordamericani nel secondo trimestre"),
);
const FEED_WTI = feedRss(
  itemRss("OPEC+ approva il terzo aumento consecutivo della produzione di petrolio"),
  itemRss("Scorte USA di greggio in calo per la quarta settimana"),
);

function depsFinte(rispostaGate = "no", feed: Partial<Record<"GOLD" | "WTI", string>> = {}) {
  const perStrumento = { GOLD: FEED_GOLD, WTI: FEED_WTI, ...feed };
  return {
    fetchRss: vi.fn(async (url: string) =>
      url === urlFeedNotizie("GOLD") ? perStrumento.GOLD : perStrumento.WTI,
    ),
    cancelloSemantico: vi.fn<(domanda: string, testo: string) => Promise<string>>(
      async () => rispostaGate,
    ),
  };
}

/* ── parser RSS ─────────────────────────────────────────────────────── */

describe("estraiVociRss", () => {
  it("estrae titolo, link, data e fonte; rimuove il suffisso ' - Fonte' di Google News", () => {
    const [voce] = estraiVociRss(FEED_GOLD);
    expect(voce.titolo).toBe("Le banche centrali hanno comprato 24 tonnellate di oro a giugno");
    expect(voce.fonte).toBe("Reuters");
    expect(voce.url).toContain("https://news.google.com");
    expect(voce.data).toBe("2026-07-24");
  });

  it("decodifica le entità HTML nei titoli", () => {
    const feed = feedRss(itemRss("L&#39;oro &amp; le riserve: cosa dicono i dati"));
    expect(estraiVociRss(feed)[0].titolo).toBe("L'oro & le riserve: cosa dicono i dati");
  });

  it("salta gli item senza titolo o link; documento irriconoscibile → lista vuota", () => {
    const feed = feedRss("<item><title>Solo titolo</title></item>", itemRss("Oro ok"));
    expect(estraiVociRss(feed)).toHaveLength(1);
    expect(estraiVociRss("<html>non è un feed</html>")).toEqual([]);
    expect(estraiVociRss("")).toEqual([]);
  });

  it("pubDate non parsabile → data null (poi scartata dalla selezione)", () => {
    const feed = feedRss(itemRss("Oro e dintorni", { data: "boh" }));
    expect(estraiVociRss(feed)[0].data).toBeNull();
  });
});

/* ── selezione notizie ──────────────────────────────────────────────── */

describe("selezionaNotizie", () => {
  const voce = (titolo: string, resto: Partial<VoceRss> = {}): VoceRss => ({
    titolo, url: "https://esempio.org/n", fonte: "Reuters", data: "2026-07-24", ...resto,
  });

  it("doppia condizione: serve il TEMA e un TERMINE DI MERCATO nel titolo", () => {
    const scelte = selezionaNotizie(
      [
        voce("Le borse europee chiudono contrastate"), // né tema né mercato
        voce("Maxi sequestro di lingotti d'oro in aeroporto a Fiumicino"), // tema senza mercato (cronaca)
        voce("Produzione di oro in Sudafrica ai minimi decennali"), // tema + mercato
      ],
      "GOLD", OGGI,
    );
    expect(scelte.map((n) => n.titolo)).toEqual(["Produzione di oro in Sudafrica ai minimi decennali"]);
  });

  it("scarta le notizie più vecchie di 14 giorni o con data mancante/futura", () => {
    const scelte = selezionaNotizie(
      [
        voce("Mercato dell'oro: report mensile", { data: "2026-07-01" }),
        voce("Mercato dell'oro: dato di ieri", { data: "2026-07-30" }),
        voce("Mercato dell'oro: senza data", { data: null }),
        voce("Mercato dell'oro: dal futuro", { data: "2026-08-15" }),
      ],
      "GOLD", OGGI,
    );
    expect(scelte.map((n) => n.titolo)).toEqual(["Mercato dell'oro: dato di ieri"]);
  });

  it("CANCELLO 1 sul titolo: un titolo con aspettativa direzionale viene scartato, si prende il successivo", () => {
    const scelte = selezionaNotizie(
      [
        voce("Gold price forecast: $4,200 in sight"),
        voce("Analisti: l'oro salirà ancora"),
        voce("Outlook trimestrale sull'oro"),
        voce("Oro: le banche centrali comprano ancora"),
      ],
      "GOLD", OGGI,
    );
    expect(scelte.map((n) => n.titolo)).toEqual(["Oro: le banche centrali comprano ancora"]);
  });

  it("REGOLA DI SELEZIONE: recenza pura — la più recente vince, a parità di giorno l'ordine del feed", () => {
    const scelte = selezionaNotizie(
      [
        voce("Mercato dell'oro: notizia vecchia", { data: "2026-07-20" }),
        voce("Mercato dell'oro: prima del giorno più recente", { data: "2026-07-29" }),
        voce("Mercato dell'oro: seconda dello stesso giorno", { data: "2026-07-29" }),
        voce("Mercato dell'oro: di mezzo", { data: "2026-07-25" }),
      ],
      "GOLD", OGGI,
    );
    expect(scelte.map((n) => n.titolo)).toEqual([
      "Mercato dell'oro: prima del giorno più recente",
      "Mercato dell'oro: seconda dello stesso giorno",
      "Mercato dell'oro: di mezzo",
    ]);
  });

  it("dedup sul titolo e massimo richiesto rispettato", () => {
    const tante = [
      voce("Mercato dell'oro: notizia uno"), voce("Mercato dell'oro: notizia uno"),
      voce("Mercato dell'oro: notizia due"), voce("Mercato dell'oro: notizia tre"),
      voce("Mercato dell'oro: notizia quattro"),
    ];
    const scelte = selezionaNotizie(tante, "GOLD", OGGI, 3);
    expect(scelte).toHaveLength(3);
    expect(new Set(scelte.map((n) => n.titolo)).size).toBe(3);
  });

  it("scarta il rumore non pertinente (comunicati societari, dividendi, indici azionari)", () => {
    const scelte = selezionaNotizie(
      [
        voce("Covered Call Gold ETF annuncia un dividendo mensile"),
        voce("Exchange lancia opzioni su oro dopo il record dei futures"),
        voce("Gold'n Futures Mineral Corp. annuncia la nomina del nuovo CEO"),
        voce("Nasdaq e S&P 500: i futures osservano i prezzi del petrolio"),
        voce("I prezzi dell'oro sono aumentati in modo generalizzato, fino a 2,1 milioni di VND per oncia"),
        voce("Mercato dell'oro: la domanda fisica resta solida nel secondo semestre"),
      ],
      "GOLD", OGGI,
    );
    expect(scelte.map((n) => n.titolo)).toEqual([
      "Mercato dell'oro: la domanda fisica resta solida nel secondo semestre",
    ]);
  });

  it("scarta URL non http(s)", () => {
    expect(
      selezionaNotizie([voce("Mercato dell'oro ok", { url: "javascript:alert(1)" })], "GOLD", OGGI),
    ).toEqual([]);
  });
});

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

/* ── pipeline ───────────────────────────────────────────────────────── */

describe("eseguiPipelineContesto (percorso notizie)", () => {
  it("feed puliti + cancello semantico 'no' → pubblicato, coi titoli ORIGINALI", async () => {
    const deps = depsFinte("no");
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(esito.contenuto.tipo).toBe("notizie");
    expect(esito.contenuto.strumenti.GOLD.notizie?.map((n) => n.titolo)).toEqual([
      "Le banche centrali hanno comprato 24 tonnellate di oro a giugno",
      "Gold ETF: deflussi record dai fondi nordamericani nel secondo trimestre",
    ]);
    // il cancello semantico ha ricevuto la domanda ESPLICITA della specifica
    expect(deps.cancelloSemantico).toHaveBeenCalledWith(
      DOMANDA_CANCELLO_SEMANTICO,
      expect.stringContaining("banche centrali"),
    );
    // screening per titolo (4) + verifica finale sul testo trovato online (1)
    expect(deps.cancelloSemantico).toHaveBeenCalledTimes(5);
    // l'ULTIMA chiamata è quella complessiva: SOLO titoli e fonti, MAI le
    // implicazioni statiche (già deliberate: non si fanno ri-giudicare)
    const testoFinale = deps.cancelloSemantico.mock.calls.at(-1)?.[1] ?? "";
    expect(testoFinale).toContain("banche centrali");
    expect(testoFinale).not.toContain(IMPLICAZIONI_MECCANICHE.mm_net["NELLA NORMA"]);
  });

  it("screening semantico per TITOLO: il titolo bocciato si scarta, il box sopravvive con gli altri", async () => {
    const deps = depsFinte("no");
    deps.cancelloSemantico.mockImplementation(async (_domanda, testo) =>
      testo.includes("deflussi record") ? "Sì" : "no",
    );
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(esito.contenuto.strumenti.GOLD.notizie?.map((n) => n.titolo)).toEqual([
      "Le banche centrali hanno comprato 24 tonnellate di oro a giugno",
    ]);
  });

  it("errore nello screening di un titolo → si scarta il titolo, mai si pubblica senza controllo", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = depsFinte("no");
    let prima = true;
    deps.cancelloSemantico.mockImplementation(async (_domanda, testo) => {
      if (prima && testo.includes("banche centrali hanno comprato")) {
        prima = false;
        throw new Error("timeout");
      }
      return "no";
    });
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(
      esito.contenuto.strumenti.GOLD.notizie?.some((n) => n.titolo.includes("banche centrali")),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("cancello finale 'sì' → scartato, anche se i singoli titoli erano passati", async () => {
    const deps = depsFinte("no");
    // screening sul singolo titolo: "no"; verifica finale (testo multi-riga): "Sì"
    deps.cancelloSemantico.mockImplementation(async (_domanda, testo) =>
      testo.includes("\n") ? "Sì" : "no",
    );
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("scartato");
    expect(esito.esito === "scartato" && esito.motivo).toContain("semantico");
  });

  it("tutto bocciato dallo screening → box coi null, e il cancello finale non ha nulla da valutare", async () => {
    const deps = depsFinte("Sì"); // ogni chiamata risponde "Sì"
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(esito.contenuto.strumenti.GOLD.notizie).toBeNull();
    expect(esito.contenuto.strumenti.WTI.notizie).toBeNull();
    // 4 screening, NESSUNA chiamata finale (niente testo generato da giudicare)
    expect(deps.cancelloSemantico).toHaveBeenCalledTimes(4);
  });

  it("errore nel cancello FINALE → scartato (fail-closed anche sugli errori)", async () => {
    const deps = depsFinte("no");
    // screening ok; la verifica finale (testo multi-riga) esplode → scarto
    deps.cancelloSemantico.mockImplementation(async (_domanda, testo) => {
      if (testo.includes("\n")) throw new Error("503");
      return "no";
    });
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("scartato");
  });

  it("errore in TUTTI gli screening → nessun titolo promosso, box coi null (mai senza controllo)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = depsFinte("no");
    deps.cancelloSemantico.mockRejectedValue(new Error("503"));
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(esito.contenuto.strumenti.GOLD.notizie).toBeNull();
    expect(esito.contenuto.strumenti.WTI.notizie).toBeNull();
    consoleError.mockRestore();
  });

  it("un feed che fallisce non butta via l'altro: strumento a null, il resto pubblicato", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = depsFinte("no");
    deps.fetchRss.mockImplementation(async (url: string) => {
      if (url === urlFeedNotizie("GOLD")) throw new Error("HTTP 503");
      return FEED_WTI;
    });
    const esito = await eseguiPipelineContesto(deps, CARTE, "2026-07-21", OGGI);
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(esito.contenuto.strumenti.GOLD.notizie).toBeNull();
    expect(esito.contenuto.strumenti.WTI.notizie).not.toBeNull();
    consoleError.mockRestore();
  });

  it("nessuna notizia utile per nessuno strumento → pubblicato coi null (mai inventare)", async () => {
    const vuoto = feedRss(itemRss("Gold price forecast for August"));
    const esito = await eseguiPipelineContesto(
      depsFinte("no", { GOLD: vuoto, WTI: feedRss() }),
      CARTE, "2026-07-21", OGGI,
    );
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    expect(esito.contenuto.strumenti.GOLD.notizie).toBeNull();
    expect(esito.contenuto.strumenti.WTI.notizie).toBeNull();
  });

  it("nel box pubblicato ogni titolo passa il cancello lessicale (mai un forecast a schermo)", async () => {
    const misto = feedRss(
      itemRss("Oil price forecast: $100 in sight"),
      itemRss("OPEC+ ha aumentato la produzione di petrolio ad agosto"),
    );
    const esito = await eseguiPipelineContesto(
      depsFinte("no", { WTI: misto }),
      CARTE, "2026-07-21", OGGI,
    );
    expect(esito.esito).toBe("pubblicato");
    if (esito.esito !== "pubblicato") return;
    for (const n of esito.contenuto.strumenti.WTI.notizie ?? []) {
      expect(controlloLessicale(n.titolo)).toEqual([]);
    }
  });
});

/* ── feed e schema ──────────────────────────────────────────────────── */

describe("urlFeedNotizie", () => {
  it("interroga Google News con la finestra di 14 giorni", () => {
    expect(urlFeedNotizie("GOLD")).toContain("news.google.com/rss/search");
    expect(decodeURIComponent(urlFeedNotizie("GOLD"))).toContain("when:14d");
    expect(decodeURIComponent(urlFeedNotizie("WTI"))).toContain("petrolio");
  });
});

describe("schema del contenuto", () => {
  it("rifiuta URL non http(s) e liste vuote non-null", () => {
    const base = {
      tipo: "notizie" as const,
      settimanaCot: "2026-07-21",
      strumenti: {
        GOLD: { notizie: [{ titolo: "Oro", url: "https://e.org", fonte: "R", data: "2026-07-24" }] },
        WTI: { notizie: null },
      },
    };
    expect(contenutoContestoCotSchema.safeParse(base).success).toBe(true);
    const urlRotto = structuredClone(base);
    urlRotto.strumenti.GOLD.notizie![0].url = "javascript:alert(1)";
    expect(contenutoContestoCotSchema.safeParse(urlRotto).success).toBe(false);
    const vuota = structuredClone(base);
    vuota.strumenti.GOLD.notizie = [];
    expect(contenutoContestoCotSchema.safeParse(vuota).success).toBe(false);
  });
});
