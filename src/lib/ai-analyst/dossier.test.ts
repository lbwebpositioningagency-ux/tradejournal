import { describe, expect, it } from "vitest";
import {
  COPERTURA_MINIMA,
  SOGLIE_FRESCHEZZA,
  buildDossier,
  calcolaCarattere,
  giorniFra,
  raccogliFonti,
  rilevaDiscordanza,
  type DossierReadings,
  type TermometroReading,
} from "@/lib/ai-analyst/dossier";
import {
  letturaAssente,
  letturaOk,
  type CotValore,
  type DispersioneValore,
  type FattorePresente,
  type IvMeseValore,
  type IvValore,
  type LivelloTrendsValore,
  type StabilitaValore,
} from "@/lib/ai-analyst/types";

/* ── fixture ─────────────────────────────────────────────────────────── */

const GIORNO = "2026-08-04";

function termometro(
  stato: "ESPANSA" | "COMPRESSA",
  percentile: number,
): TermometroReading {
  return {
    stato: {
      tipo: "termometro_stato",
      simbolo: "XAUUSD",
      indiceIv: "GVZ",
      iv: 18.4,
      decimaliIv: 2,
      stato,
      posizione: { modalita: "puntuale", percentile },
      finestraSchermo: "2014 → oggi",
      finestraCorta: false,
    },
    ampiezza: {
      tipo: "termometro_ampiezza",
      stato,
      relativa: { mediana: 0.0161, q25: 0.0108, q75: 0.0234 },
      valuta: { mediana: 64.4, q25: 43.2, q75: 93.6 },
      motivoValutaAssente: null,
      unita: "$",
      decimaliPrezzo: 2,
    },
    affidabilita: {
      tipo: "termometro_affidabilita",
      stato,
      esitoAtteso: "ampia",
      quota: 0.71,
      baseRate: 0.5,
      guadagnoPp: 21,
      n: 1234,
      calcolataDa: "2014-01-02",
      calcolataFinoA: "2025-12-31",
      persistenza: { quotaInvariati: 0.82, durataMediaGiorni: 5.4 },
    },
  };
}

const IV: IvValore = {
  tipo: "iv",
  etichetta: "GVZ",
  proxy: false,
  livello: 18.4,
  pct1: 78,
  pct3: 61,
  pct5: 55,
  var1S: 0.9,
  var1M: -1.2,
};

const COT_PART: CotValore = {
  tipo: "cot",
  metrica: "open_interest",
  banda: "ALTO",
  posizioneBarra: 74.6,
  annoInizio: 2017,
  settimane: 496,
  delta4Settimane: 7912,
};

const COT_POS: CotValore = { ...COT_PART, metrica: "mm_net", banda: "NELLA NORMA", posizioneBarra: 52.1 };

const DISP_MESE: DispersioneValore = {
  tipo: "dispersione",
  granularita: "MESE",
  bucket: "Agosto",
  stdevPct: 4.2,
  iqrPct: 5.1,
  n: 20,
  quality: "ok",
  anniFinestra: 20,
  primoAnno: "2006",
  ultimoAnno: "2025",
};

const DISP_GIORNO: DispersioneValore = {
  ...DISP_MESE,
  granularita: "GIORNO",
  bucket: "Martedì",
};

const IV_MESE: IvMeseValore = {
  tipo: "iv_mese",
  etichetta: "GVZ",
  proxy: false,
  mese: "Agosto",
  media: 17.1,
  n: 18,
  quality: "ok",
  anniFinestra: 20,
};

const STABILITA: StabilitaValore = {
  tipo: "stabilita",
  percentileMediano: 44,
  banda: "NELLA NORMA",
  nRelazioni: 3,
  annoInizio: "2015",
  sedute: 2700,
};

const NFCI: LivelloTrendsValore = {
  tipo: "livello_trends",
  etichetta: "Condizioni finanziarie (NFCI)",
  livello: -0.51,
  unita: "",
  decimali: 2,
  percentile: 12,
  var1S: 0.01,
};

const HY: LivelloTrendsValore = {
  ...NFCI,
  etichetta: "Spread HY (OAS)",
  livello: 3.12,
  unita: "%",
  percentile: 22,
};

/** Tutte le letture presenti e datate al giorno del dossier. */
function letturePiene(data = GIORNO): DossierReadings {
  return {
    termometro: letturaOk(termometro("ESPANSA", 78), data),
    iv: letturaOk(IV, data),
    cotPartecipazione: letturaOk(COT_PART, data),
    cotPosizionamento: letturaOk(COT_POS, data),
    dispersioneMese: letturaOk(DISP_MESE, data),
    dispersioneGiorno: letturaOk(DISP_GIORNO, data),
    ivMese: letturaOk(IV_MESE, data),
    stabilita: letturaOk(STABILITA, data),
    nfci: letturaOk(NFCI, data),
    hyOas: letturaOk(HY, data),
  };
}

function lettureVuote(motivo: "fonte_non_disponibile" = "fonte_non_disponibile"): DossierReadings {
  return {
    termometro: letturaAssente(motivo),
    iv: letturaAssente(motivo),
    cotPartecipazione: letturaAssente(motivo),
    cotPosizionamento: letturaAssente(motivo),
    dispersioneMese: letturaAssente(motivo),
    dispersioneGiorno: letturaAssente(motivo),
    ivMese: letturaAssente(motivo),
    stabilita: letturaAssente(motivo),
    nfci: letturaAssente(motivo),
    hyOas: letturaAssente(motivo),
  };
}

/** Data spostata indietro di N giorni rispetto al giorno del dossier. */
function giorniPrima(n: number, da = GIORNO): string {
  return new Date(Date.parse(`${da}T00:00:00Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/* ── giorniFra ───────────────────────────────────────────────────────── */

describe("giorniFra", () => {
  it("conta i giorni interi in UTC, senza fusi di mezzo", () => {
    expect(giorniFra("2026-08-01", "2026-08-04")).toBe(3);
    expect(giorniFra("2026-08-04", "2026-08-04")).toBe(0);
    // Attraverso il cambio di ora legale italiana (ultima domenica di ottobre)
    expect(giorniFra("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("è negativo se il dato è nel futuro e NaN se la data non si parsa", () => {
    expect(giorniFra("2026-08-05", "2026-08-04")).toBe(-1);
    expect(Number.isNaN(giorniFra("non-una-data", "2026-08-04"))).toBe(true);
  });
});

/* ── caso pieno ──────────────────────────────────────────────────────── */

describe("buildDossier — caso pieno", () => {
  const d = buildDossier("ORO", GIORNO, letturePiene());

  it("presenta tutti e 12 i fattori dell'oro", () => {
    expect(d.presenti).toBe(12);
    expect(d.attesiApplicabili).toBe(12);
    expect(d.copertura).toBe(1);
    expect(d.assenti).toEqual([]);
    expect(d.fattori.map((f) => f.id)).toEqual([
      "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    ]);
  });

  it("non è insufficiente e non è discorde", () => {
    expect(d.datiInsufficienti).toBe(false);
    expect(d.motivoInsufficienza).toBeNull();
    expect(d.discordanza).toBe(false);
  });

  it("dichiara espansione (stato ESPANSA con volatilità implicita in alto)", () => {
    expect(d.carattereAtteso).toBe("CONDIZIONI_DI_ESPANSIONE");
  });

  it("dà confidenza BUONA con tutto fresco e concorde", () => {
    expect(d.confidenza).toBe("BUONA");
    expect(d.motivoConfidenza).toContain("12 fattori su 12");
  });

  it("assegna i pesi pre-registrati", () => {
    const peso = (id: string) => d.fattori.find((f) => f.id === id)?.peso;
    expect(peso("F1")).toBe("ALTO");
    expect(peso("F2")).toBe("ALTO");
    expect(peso("F3")).toBe("ALTO");
    expect(peso("F4")).toBe("MEDIO");
    expect(peso("F5")).toBe("MEDIO");
    expect(peso("F6")).toBe("BASSO");
    expect(peso("F12")).toBe("BASSO");
  });

  it("non espone mai fattori di classe (c)", () => {
    for (const f of d.fattori) expect(["a", "b"]).toContain(f.classe);
  });

  it("dichiara il dato più vecchio e le sezioni lette senza duplicati", () => {
    expect(d.datoPiuVecchio).toBe(GIORNO);
    const sezioni = d.fonti.map((f) => f.sezione);
    expect(new Set(sezioni).size).toBe(sezioni.length);
    expect(sezioni).toContain("Termometro di volatilità");
    expect(sezioni).toContain("Posizionamento (CFTC)");
  });
});

/* ── caso vuoto ──────────────────────────────────────────────────────── */

describe("buildDossier — caso vuoto", () => {
  const d = buildDossier("ORO", GIORNO, lettureVuote());

  it("non inventa nulla: zero fattori, tutti gli assenti col motivo", () => {
    expect(d.fattori).toEqual([]);
    expect(d.assenti).toHaveLength(12);
    for (const a of d.assenti) expect(a.motivo).toBe("fonte_non_disponibile");
    expect(d.datoPiuVecchio).toBeNull();
    expect(d.fonti).toEqual([]);
  });

  it("si dichiara insufficiente, indeterminato e senza confidenza", () => {
    expect(d.datiInsufficienti).toBe(true);
    expect(d.motivoInsufficienza).toContain("0 fattori su 12");
    expect(d.carattereAtteso).toBe("INDETERMINATO");
    expect(d.confidenza).toBe("NULLA");
  });
});

/* ── caso con buchi ──────────────────────────────────────────────────── */

describe("buildDossier — caso con buchi", () => {
  it("resta sufficiente finché la copertura arriva alla metà", () => {
    // 6 presenti su 12 = esattamente COPERTURA_MINIMA, che NON è sotto soglia.
    const r = letturePiene();
    r.cotPartecipazione = letturaAssente("fonte_non_disponibile");
    r.cotPosizionamento = letturaAssente("fonte_non_disponibile");
    r.dispersioneMese = letturaAssente("fonte_non_disponibile");
    r.dispersioneGiorno = letturaAssente("fonte_non_disponibile");
    r.ivMese = letturaAssente("fonte_non_disponibile");
    r.stabilita = letturaAssente("fonte_non_disponibile");
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.presenti).toBe(6);
    expect(d.copertura).toBe(COPERTURA_MINIMA);
    expect(d.datiInsufficienti).toBe(false);
    // Sotto il 60% la confidenza scende comunque.
    expect(d.confidenza).toBe("BASSA");
  });

  it("diventa insufficiente appena scende sotto la metà", () => {
    const r = lettureVuote();
    r.termometro = letturaOk(termometro("ESPANSA", 78), GIORNO);
    r.iv = letturaOk(IV, GIORNO);
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.presenti).toBe(4); // F1, F2, F3, F4
    expect(d.datiInsufficienti).toBe(true);
    expect(d.carattereAtteso).toBe("INDETERMINATO");
    expect(d.confidenza).toBe("NULLA");
  });

  it("è insufficiente anche con buona copertura se manca del tutto la volatilità implicita", () => {
    const r = letturePiene();
    r.termometro = letturaAssente("fonte_non_disponibile");
    r.iv = letturaAssente("fonte_non_disponibile");
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.presenti).toBe(8);
    expect(d.copertura).toBeGreaterThan(COPERTURA_MINIMA);
    expect(d.datiInsufficienti).toBe(true);
    expect(d.motivoInsufficienza).toContain("volatilità implicita");
  });

  it("ricade sull'indice di volatilità implicita quando manca il termometro", () => {
    const r = letturePiene();
    r.termometro = letturaAssente("fonte_non_disponibile");
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.presenti).toBe(9);
    expect(d.carattereAtteso).toBe("CONDIZIONI_DI_ESPANSIONE"); // pct1 = 78 ≥ 70
    expect(d.confidenza).toBe("BASSA");
    expect(d.motivoConfidenza).toContain("termometro");
  });
});

/* ── non applicabile ─────────────────────────────────────────────────── */

describe("buildDossier — fattori non applicabili", () => {
  it("il DAX non conta termometro e COT nel denominatore", () => {
    const d = buildDossier("DAX", GIORNO, letturePiene());
    // 12 − 3 (termometro: nessun indice IV del DAX nel pannello) − 2 (COT) = 7
    expect(d.attesiApplicabili).toBe(7);
    expect(d.presenti).toBe(7);
    expect(d.copertura).toBe(1);
    const nonApplicabili = d.assenti.filter((a) => a.motivo === "non_applicabile");
    expect(nonApplicabili.map((a) => a.id).sort()).toEqual(
      ["F1", "F2", "F3", "F5", "F6"].sort(),
    );
    for (const a of nonApplicabili) expect(a.applicabile).toBe(false);
  });

  it("il DAX resta valutabile via indice di volatilità implicita, con confidenza BASSA", () => {
    const d = buildDossier("DAX", GIORNO, letturePiene());
    expect(d.datiInsufficienti).toBe(false);
    expect(d.carattereAtteso).toBe("CONDIZIONI_DI_ESPANSIONE");
    // Manca F1: la regola §6.2 impone BASSA anche con copertura piena.
    expect(d.confidenza).toBe("BASSA");
  });

  it("l'S&P 500 non conta COT né Driver Desk", () => {
    const d = buildDossier("SP500", GIORNO, letturePiene());
    expect(d.attesiApplicabili).toBe(9); // 12 − 2 (COT) − 1 (Driver)
    expect(d.assenti.map((a) => a.id).sort()).toEqual(["F10", "F5", "F6"]);
  });
});

/* ── freschezza ──────────────────────────────────────────────────────── */

describe("buildDossier — freschezza", () => {
  it("sulla soglia di avviso il dato è ancora fresco, un giorno dopo no", () => {
    const warn = SOGLIE_FRESCHEZZA.termometro.warn; // 3
    const sulla = buildDossier("ORO", GIORNO, {
      ...letturePiene(),
      termometro: letturaOk(termometro("ESPANSA", 78), giorniPrima(warn)),
    });
    expect(sulla.fattori.find((f) => f.id === "F1")?.freschezza).toBe("fresco");

    const oltre = buildDossier("ORO", GIORNO, {
      ...letturePiene(),
      termometro: letturaOk(termometro("ESPANSA", 78), giorniPrima(warn + 1)),
    });
    const f1 = oltre.fattori.find((f) => f.id === "F1");
    expect(f1?.freschezza).toBe("invecchiato");
    expect(f1?.giorniEta).toBe(warn + 1);
    // Un fattore invecchiato scende di un gradino: ALTO → MEDIO.
    expect(f1?.peso).toBe("MEDIO");
    expect(oltre.confidenza).toBe("MEDIA");
  });

  it("sulla soglia di scarto il dato c'è ancora, un giorno dopo sparisce", () => {
    const drop = SOGLIE_FRESCHEZZA.termometro.drop; // 10
    const sulla = buildDossier("ORO", GIORNO, {
      ...letturePiene(),
      termometro: letturaOk(termometro("ESPANSA", 78), giorniPrima(drop)),
    });
    expect(sulla.fattori.some((f) => f.id === "F1")).toBe(true);

    const oltre = buildDossier("ORO", GIORNO, {
      ...letturePiene(),
      termometro: letturaOk(termometro("ESPANSA", 78), giorniPrima(drop + 1)),
    });
    expect(oltre.fattori.some((f) => f.id === "F1")).toBe(false);
    expect(
      oltre.assenti.filter((a) => a.motivo === "dato_stantio").map((a) => a.id),
    ).toEqual(["F1", "F2", "F3"]);
  });

  it("ogni fonte ha la propria soglia: il COT sopravvive a 14 giorni, il termometro no", () => {
    const r = letturePiene();
    r.termometro = letturaOk(termometro("ESPANSA", 78), giorniPrima(14));
    r.cotPartecipazione = letturaOk(COT_PART, giorniPrima(14));
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.fattori.some((f) => f.id === "F1")).toBe(false);
    const f5 = d.fattori.find((f) => f.id === "F5");
    expect(f5?.freschezza).toBe("invecchiato");
  });

  it("una data nel futuro vale zero giorni, non un'età negativa", () => {
    const r = letturePiene();
    r.iv = letturaOk(IV, "2026-08-06");
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.fattori.find((f) => f.id === "F4")?.giorniEta).toBe(0);
  });

  it("una data non parsabile scarta il fattore invece di fingerlo fresco", () => {
    const r = letturePiene();
    r.iv = letturaOk(IV, "boh");
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.fattori.some((f) => f.id === "F4")).toBe(false);
    expect(d.assenti.find((a) => a.id === "F4")?.motivo).toBe(
      "fonte_non_disponibile",
    );
  });

  it("il dato più vecchio è il minimo fra quelli davvero usati", () => {
    const r = letturePiene();
    r.cotPartecipazione = letturaOk(COT_PART, giorniPrima(9));
    r.cotPosizionamento = letturaOk(COT_POS, giorniPrima(9));
    const d = buildDossier("ORO", GIORNO, r);
    expect(d.datoPiuVecchio).toBe(giorniPrima(9));
  });
});

/* ── verdetto ────────────────────────────────────────────────────────── */

describe("carattere atteso", () => {
  const fattore = (valore: FattorePresente["valore"]): FattorePresente => ({
    id: "F1",
    nome: "x",
    classe: "a",
    peso: "ALTO",
    dataDato: GIORNO,
    giorniEta: 0,
    freschezza: "fresco",
    valore,
  });

  it("espansione solo se lo stato è ESPANSO E la volatilità implicita è in alto", () => {
    const alto = fattore(termometro("ESPANSA", 70).stato);
    const medio = fattore(termometro("ESPANSA", 69).stato);
    expect(
      calcolaCarattere({ datiInsufficienti: false, f1: alto, f4: undefined }),
    ).toBe("CONDIZIONI_DI_ESPANSIONE");
    expect(
      calcolaCarattere({ datiInsufficienti: false, f1: medio, f4: undefined }),
    ).toBe("NELLA_NORMA");
  });

  it("compressione solo se lo stato è COMPRESSO E la volatilità implicita è in basso", () => {
    const basso = fattore(termometro("COMPRESSA", 30).stato);
    const medio = fattore(termometro("COMPRESSA", 31).stato);
    expect(
      calcolaCarattere({ datiInsufficienti: false, f1: basso, f4: undefined }),
    ).toBe("CONDIZIONI_DI_COMPRESSIONE");
    expect(
      calcolaCarattere({ datiInsufficienti: false, f1: medio, f4: undefined }),
    ).toBe("NELLA_NORMA");
  });

  it("con le sole ancore guarda l'estremo dell'intervallo, non un punto interpolato", () => {
    const base = termometro("ESPANSA", 0).stato;
    const dentro = fattore({
      ...base,
      posizione: { modalita: "intervallo", da: 75, a: 95 },
    });
    const aCavallo = fattore({
      ...base,
      posizione: { modalita: "intervallo", da: 50, a: 75 },
    });
    expect(
      calcolaCarattere({ datiInsufficienti: false, f1: dentro, f4: undefined }),
    ).toBe("CONDIZIONI_DI_ESPANSIONE");
    expect(
      calcolaCarattere({ datiInsufficienti: false, f1: aCavallo, f4: undefined }),
    ).toBe("NELLA_NORMA");
  });

  it("dati insufficienti vincono su tutto", () => {
    expect(
      calcolaCarattere({
        datiInsufficienti: true,
        f1: fattore(termometro("ESPANSA", 95).stato),
        f4: undefined,
      }),
    ).toBe("INDETERMINATO");
  });
});

describe("discordanza", () => {
  const f1 = (stato: "ESPANSA" | "COMPRESSA"): FattorePresente => ({
    id: "F1",
    nome: "x",
    classe: "a",
    peso: "ALTO",
    dataDato: GIORNO,
    giorniEta: 0,
    freschezza: "fresco",
    valore: termometro(stato, 50).stato,
  });
  const f4 = (pct1: number | null): FattorePresente => ({
    id: "F4",
    nome: "y",
    classe: "a",
    peso: "MEDIO",
    dataDato: GIORNO,
    giorniEta: 0,
    freschezza: "fresco",
    valore: { ...IV, pct1 },
  });

  it("scatta con stato espanso e volatilità implicita in basso", () => {
    expect(rilevaDiscordanza(f1("ESPANSA"), f4(25))).toBe(true);
  });

  it("scatta con stato compresso e volatilità implicita in alto", () => {
    expect(rilevaDiscordanza(f1("COMPRESSA"), f4(85))).toBe(true);
  });

  it("non scatta nei casi concordi o quando manca un termine", () => {
    expect(rilevaDiscordanza(f1("ESPANSA"), f4(85))).toBe(false);
    expect(rilevaDiscordanza(f1("ESPANSA"), f4(null))).toBe(false);
    expect(rilevaDiscordanza(undefined, f4(25))).toBe(false);
  });

  it("porta la confidenza a BASSA anche con copertura piena", () => {
    const r = letturePiene();
    r.termometro = letturaOk(termometro("COMPRESSA", 20), GIORNO);
    const d = buildDossier("ORO", GIORNO, r); // pct1 di IV = 78
    expect(d.discordanza).toBe(true);
    expect(d.confidenza).toBe("BASSA");
    expect(d.carattereAtteso).toBe("CONDIZIONI_DI_COMPRESSIONE");
  });
});

/* ── fonti ───────────────────────────────────────────────────────────── */

describe("raccogliFonti", () => {
  it("una riga per sezione, con la data del dato più vecchio della sezione", () => {
    const base = {
      nome: "x",
      classe: "a" as const,
      peso: "ALTO" as const,
      giorniEta: 0,
      freschezza: "fresco" as const,
      valore: termometro("ESPANSA", 50).stato,
    };
    const fonti = raccogliFonti([
      { ...base, id: "F1", dataDato: "2026-08-01" },
      { ...base, id: "F2", dataDato: "2026-07-29" },
      { ...base, id: "F3", dataDato: "2026-08-02" },
    ]);
    expect(fonti).toEqual([
      { sezione: "Termometro di volatilità", dataDato: "2026-07-29" },
    ]);
  });
});
