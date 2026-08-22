import { describe, expect, it } from "vitest";

import tabellaJson from "@/data/termometro-volatilita.json";
import {
  componiIngressi,
  estraiChiusureDaBiasRecord,
  estraiIvDaVolPanel,
  intervalloDaAncore,
  leggiTermometro,
  metaTermometro,
  percentileDaGriglia,
  strumentoVisibile,
} from "@/lib/termometro-volatilita";
import {
  BIAS_RECORD_DAILY_REALE,
  VOL_ITEMS_DAILY_REALI,
} from "@/lib/termometro-volatilita.fixture";

/* Il JSON è eterogeneo per costruzione (strumenti con griglia 0-100 e strumenti con sole
   ancore), quindi qui si accede in modo lasco: i tipi stretti vivono nella libreria. */
type Qualsiasi = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tabella = tabellaJson as unknown as {
  generato_il: string;
  strumenti: Record<string, Qualsiasi>;
};

/** Tutti gli strumenti in tabella. Tutti e quattro hanno ora griglia 0-100 e persistenza:
 *  per SP500 sono state completate da VIXCLS.csv (fonte FRED), congelando la soglia già
 *  validata esternamente. Vedi describe "S&P 500" più sotto per le differenze di metodo
 *  che restano (persistenza sul calendario del VIX, non sui giorni di trading dell'indice). */
const TUTTI = ["XAUUSD", "WTICOUSD", "GER40", "SP500"] as const;
/** Quelli tradati: lo S&P 500 resta solo contesto macro, per RUOLO non per dati mancanti. */
const TRADATI = ["XAUUSD", "WTICOUSD", "GER40"] as const;

describe("tabella di riferimento", () => {
  it("contiene i quattro strumenti attesi", () => {
    expect(metaTermometro().simboli.sort()).toEqual([...TUTTI].sort());
  });

  it.each(TUTTI)("%s: la griglia dei percentili è monotona non decrescente", (s) => {
    const g = tabella.strumenti[s].riferimento.percentili as Record<string, number>;
    for (let p = 0; p < 100; p += 1) {
      expect(g[String(p)]).toBeLessThanOrEqual(g[String(p + 1)]);
    }
  });

  it.each(TUTTI)("%s: il percentile 50 coincide con la soglia di stato", (s) => {
    const r = tabella.strumenti[s].riferimento;
    expect(Math.abs(r.percentili["50"] - r.soglia_stato)).toBeLessThan(0.05);
  });

  it.each(TUTTI)("%s: dichiara una persistenza dello stato", (s) => {
    const p = tabella.strumenti[s].persistenza;
    expect(p).not.toBeNull();
    expect(p.durata_media_giorni).toBeGreaterThan(1);
    expect(p.quota_giorni_invariati).toBeGreaterThan(0.5);
    expect(p.quota_giorni_invariati).toBeLessThan(1);
  });

  it.each(TUTTI)("%s: l'ampiezza mediana in ESPANSA supera quella in COMPRESSA", (s) => {
    const a = tabella.strumenti[s].ampiezza;
    expect(a.ESPANSA.mediana_rel).toBeGreaterThan(a.COMPRESSA.mediana_rel);
  });

  it.each(TUTTI)("%s: i quartili racchiudono la mediana", (s) => {
    const a = tabella.strumenti[s].ampiezza;
    for (const stato of ["ESPANSA", "COMPRESSA"] as const) {
      expect(a[stato].q25_rel).toBeLessThanOrEqual(a[stato].mediana_rel);
      expect(a[stato].mediana_rel).toBeLessThanOrEqual(a[stato].q75_rel);
    }
  });

  it.each(TUTTI)("%s: i due base rate del periodo sommano a 1", (s) => {
    const a = tabella.strumenti[s].affidabilita;
    expect(a.base_rate_giornate_ampie + a.base_rate_giornate_strette).toBeCloseTo(1, 9);
  });

  it.each(TUTTI)("%s: ogni stato dichiara l'esito che prevede", (s) => {
    const a = tabella.strumenti[s].affidabilita;
    expect(a.ESPANSA.esito_atteso).toBe("ampia");
    expect(a.COMPRESSA.esito_atteso).toBe("stretta");
  });

  it.each(TUTTI)("%s: in entrambi gli stati la quota supera il proprio base rate", (s) => {
    const a = tabella.strumenti[s].affidabilita;
    for (const stato of ["ESPANSA", "COMPRESSA"] as const) {
      expect(a[stato].quota_esito_atteso).toBeGreaterThan(a[stato].base_rate_esito_atteso);
    }
  });

  it.each(TUTTI)("%s: il display usa una storia più ampia della validazione", (s) => {
    const a = tabella.strumenti[s].affidabilita;
    const v = tabella.strumenti[s].validazione_out_of_sample;
    expect(a.n_totale).toBeGreaterThan(1000);
    expect(v.n_totale).toBeLessThan(300);
    expect(a.calcolata_da < v.periodo_da).toBe(true);
    expect(a.warmup_mediana_ampiezza).toBe(250);
  });

  it.each(TUTTI)("%s: la validazione out-of-sample resta un blocco separato", (s) => {
    const v = tabella.strumenti[s].validazione_out_of_sample;
    expect(v.periodo_da).toMatch(/^2025-07-/);
    expect(v.periodo_a).toMatch(/^2026-07-/);
    // la soglia della validazione è pre-holdout, diversa da quella di produzione
    expect(v.soglia_al_momento_della_misura).not.toBe(
      tabella.strumenti[s].riferimento.soglia_stato,
    );
  });

  it.each(TUTTI)("%s: il guadagno nel JSON coincide con quota meno base rate", (s) => {
    const a = tabella.strumenti[s].affidabilita;
    for (const stato of ["ESPANSA", "COMPRESSA"] as const) {
      expect(a[stato].guadagno_pp).toBeCloseTo(
        (a[stato].quota_esito_atteso - a[stato].base_rate_esito_atteso) * 100,
        1,
      );
    }
  });

  it.each(TUTTI)("%s: dichiara una banda di plausibilità del prezzo ordinata", (s) => {
    const b = tabella.strumenti[s].banda_plausibilita_prezzo as number[];
    expect(Array.isArray(b)).toBe(true);
    expect(b).toHaveLength(2);
    expect(b[0]).toBeLessThan(b[1]);
  });

  it("non contiene la parola vietata dall'interfaccia", () => {
    expect(JSON.stringify(tabella).toLowerCase()).not.toContain("edge");
  });
});

describe("GER40 — nascosto in UI, dati intatti", () => {
  it("il flag è esplicito solo su GER40, assente sugli altri tre", () => {
    expect(tabella.strumenti.GER40.visibile_in_ui).toBe(false);
    expect(tabella.strumenti.XAUUSD.visibile_in_ui).toBeUndefined();
    expect(tabella.strumenti.WTICOUSD.visibile_in_ui).toBeUndefined();
    expect(tabella.strumenti.SP500.visibile_in_ui).toBeUndefined();
  });

  it("strumentoVisibile legge il flag: false esplicito, true per assenza (fallback)", () => {
    expect(strumentoVisibile("GER40")).toBe(false);
    expect(strumentoVisibile("XAUUSD")).toBe(true);
    expect(strumentoVisibile("WTICOUSD")).toBe(true);
    expect(strumentoVisibile("SP500")).toBe(true);
  });

  it("uno strumento non presente in tabella è considerato visibile per default", () => {
    expect(strumentoVisibile("EURUSD")).toBe(true);
  });

  it("il GER40 mantiene griglia, ampiezza, affidabilità e validazione complete", () => {
    const g = tabella.strumenti.GER40;
    expect(Math.round(g.riferimento.soglia_stato * 100) / 100).toBe(18.53);
    expect(g.riferimento.percentili_modalita).toBe("griglia");
    expect(Object.keys(g.riferimento.percentili)).toHaveLength(101);
    expect(g.ampiezza.ESPANSA.mediana_rel).toBeGreaterThan(g.ampiezza.COMPRESSA.mediana_rel);
    expect(g.affidabilita.n_totale).toBeGreaterThan(1000);
    expect(g.validazione_out_of_sample.n_totale).toBeGreaterThan(200);
    expect(g.persistenza.durata_media_giorni).toBe(10.8);
  });

  it("leggiTermometro continua a funzionare per il GER40: nascondere è un problema di resa, non di dati", () => {
    const l = leggiTermometro("GER40", { iv: 25 });
    expect(l).not.toBeNull();
    expect(l!.stato).toBeDefined();
  });

  it("simboli include ancora il GER40: la lista dati resta completa", () => {
    expect(metaTermometro().simboli).toContain("GER40");
  });

  it("gli aggregati mostrati in copy (durata, periodi) escludono lo strumento nascosto", () => {
    const m = metaTermometro();
    // durate: XAUUSD 18.8, WTICOUSD 11.5, GER40 10.8 (nascosto), SP500 17.7
    // se GER40 contasse, il minimo sarebbe 10.8; escluso, il minimo è 11.5 (WTICOUSD)
    expect(m.durataMinGiorni).toBe(11.5);
    expect(m.durataMaxGiorni).toBe(18.8);
  });
});

describe("S&P 500 — strumento di solo contesto macro", () => {
  it("è marcato come contesto macro nella tabella", () => {
    expect(tabella.strumenti.SP500.ruolo).toBe("contesto_macro");
    expect(tabella.strumenti.SP500.nota_ruolo).toBeTruthy();
  });

  it.each(TRADATI)("%s resta uno strumento tradato", (s) => {
    expect(tabella.strumenti[s].ruolo).toBe("strumento_tradato");
  });

  it("la lettura espone il ruolo, così la card non può essere scambiata", () => {
    const l = leggiTermometro("SP500", { iv: 20 })!;
    expect(l.ruolo).toBe("contesto_macro");
    expect(l.soloContesto).toBe(true);
    expect(l.notaRuolo).toMatch(/non è uno degli strumenti tradati/i);
  });

  it.each(TRADATI)("la lettura di %s non è marcata come solo contesto", (s) => {
    const soglia = tabella.strumenti[s].riferimento.soglia_stato;
    const l = leggiTermometro(s, { iv: soglia + 1 })!;
    expect(l.soloContesto).toBe(false);
    expect(l.notaRuolo).toBeNull();
  });

  it("usa l'indice VIX e la finestra lunga dal 2000", () => {
    const l = leggiTermometro("SP500", { iv: 20 })!;
    expect(l.indiceIv).toBe("VIX");
    expect(l.finestraSchermo).toBe("rif. 2000-2026");
    expect(l.finestraCorta).toBe(false);
  });

  it.each(TUTTI)("%s: mostra un percentile puntuale, non un intervallo", (s) => {
    const soglia = tabella.strumenti[s].riferimento.soglia_stato;
    const l = leggiTermometro(s, { iv: soglia + 1 })!;
    expect(l.posizione.modalita).toBe("puntuale");
  });

  it("il percentile dell'S&P 500 è coerente con la griglia completata da VIXCLS", () => {
    const l = leggiTermometro("SP500", { iv: 20 })!;
    expect(l.posizione.modalita).toBe("puntuale");
    if (l.posizione.modalita === "puntuale") {
      // dalla griglia: p62=19.99, p63=20.22 -> interpolato ~62.0
      expect(l.posizione.percentile).toBeCloseTo(62, 0);
    }
  });

  it("la griglia dell'S&P 500 è completata da VIXCLS.csv, soglia invariata", () => {
    const r = tabella.strumenti.SP500.riferimento;
    expect(r.percentili_modalita).toBe("griglia");
    expect(r.nota_percentili).toMatch(/VIXCLS\.csv/);
    // la soglia resta quella congelata dalla validazione esterna (17,77), non ricalcolata
    expect(r.soglia_stato).toBe(17.77);
  });

  it("la persistenza dell'S&P 500 è calcolata, con il metodo dichiarato esplicitamente", () => {
    const p = tabella.strumenti.SP500.persistenza;
    expect(p).not.toBeNull();
    expect(p.n).toBeGreaterThan(5000);
    // dichiara che il metodo differisce da quello degli strumenti gestiti (giorni di
    // trading vs calendario di pubblicazione dell'indice): non va nascosto
    expect(p.metodo).toMatch(/calendario di pubblicazione/i);
    expect(p.metodo).toMatch(/non.*giorni di trading/i);
  });

  it("la nota d'uso sulla durata include l'S&P 500 e i due tradati visibili (GER40 escluso)", () => {
    const m = metaTermometro();
    const visibili = TUTTI.filter(strumentoVisibile);
    expect(visibili).not.toContain("GER40");
    const durate = visibili.map(
      (s) => tabella.strumenti[s].persistenza.durata_media_giorni as number,
    );
    expect(m.durataMinGiorni).toBe(Math.min(...durate));
    expect(m.durataMaxGiorni).toBe(Math.max(...durate));
    expect(Number.isFinite(m.durataMinGiorni)).toBe(true);
  });

  it("riporta i numeri della validazione dichiarati dalla pre-registrazione", () => {
    const v = tabella.strumenti.SP500.validazione_out_of_sample;
    expect(v.n_totale).toBe(251);
    expect(v.criteri.accuratezza.esito).toBe("PASSA");
    expect(v.criteri.spread_pp.esito).toBe("PASSA");
    expect(v.criteri.rapporto_ampiezza.esito).toBe("PASSA");
  });
});

describe("intervalloDaAncore", () => {
  const ancore = { "5": 11.37, "25": 14.04, "50": 17.76, "75": 23.12, "95": 34.12 };

  it("colloca sotto la prima ancora", () => {
    expect(intervalloDaAncore(ancore, 9)).toEqual({ da: 0, a: 5 });
  });

  it("colloca sopra l'ultima ancora", () => {
    expect(intervalloDaAncore(ancore, 60)).toEqual({ da: 95, a: 100 });
  });

  it("colloca fra due ancore consecutive", () => {
    expect(intervalloDaAncore(ancore, 15)).toEqual({ da: 25, a: 50 });
    expect(intervalloDaAncore(ancore, 30)).toEqual({ da: 75, a: 95 });
  });

  it("un valore esattamente su un'ancora chiude su quell'ancora", () => {
    expect(intervalloDaAncore(ancore, 14.04)).toEqual({ da: 5, a: 25 });
  });

  it("senza ancore non inventa nulla", () => {
    expect(intervalloDaAncore({}, 20)).toEqual({ da: 0, a: 100 });
  });
});

describe("percentileDaGriglia", () => {
  const griglia: Record<string, number> = {};
  for (let p = 0; p <= 100; p += 1) griglia[String(p)] = p * 2;

  it("satura agli estremi", () => {
    expect(percentileDaGriglia(griglia, -50)).toBe(0);
    expect(percentileDaGriglia(griglia, 999)).toBe(100);
  });

  it("restituisce il percentile esatto sui nodi della griglia", () => {
    expect(percentileDaGriglia(griglia, 60)).toBe(30);
  });

  it("interpola fra due nodi", () => {
    expect(percentileDaGriglia(griglia, 61)).toBeCloseTo(30.5, 6);
  });

  it("su un tratto piatto restituisce il punto medio del tratto", () => {
    const piatta: Record<string, number> = {};
    for (let p = 0; p <= 100; p += 1) piatta[String(p)] = p < 20 ? p : p <= 30 ? 20 : p;
    expect(percentileDaGriglia(piatta, 20)).toBe(25);
  });
});

describe("leggiTermometro", () => {
  it("restituisce null senza IV: nessuno stato inventato", () => {
    expect(leggiTermometro("XAUUSD", { iv: null })).toBeNull();
    expect(leggiTermometro("XAUUSD", undefined)).toBeNull();
    expect(leggiTermometro("XAUUSD", { iv: Number.NaN })).toBeNull();
    expect(leggiTermometro("SP500", { iv: null })).toBeNull();
  });

  it("restituisce null per uno strumento non in tabella", () => {
    expect(leggiTermometro("EURUSD", { iv: 12 })).toBeNull();
  });

  it.each(TUTTI)("%s: sopra la soglia è ESPANSA, sotto è COMPRESSA", (s) => {
    const soglia = tabella.strumenti[s].riferimento.soglia_stato;
    expect(leggiTermometro(s, { iv: soglia + 1 })!.stato).toBe("ESPANSA");
    expect(leggiTermometro(s, { iv: soglia - 1 })!.stato).toBe("COMPRESSA");
  });

  it.each(TUTTI)("%s: esattamente sulla soglia lo stato è COMPRESSA", (s) => {
    const soglia = tabella.strumenti[s].riferimento.soglia_stato;
    expect(leggiTermometro(s, { iv: soglia })!.stato).toBe("COMPRESSA");
  });

  it("l'affidabilità si riferisce allo stato mostrato, non alla coppia", () => {
    const soglia = tabella.strumenti.XAUUSD.riferimento.soglia_stato;
    const esp = leggiTermometro("XAUUSD", { iv: soglia + 5 })!;
    expect(esp.affidabilita.esitoAtteso).toBe("ampia");
    expect(esp.affidabilita.n).toBe(570);
    expect(esp.affidabilita.quota).toBeCloseTo(0.746, 3);

    const com = leggiTermometro("XAUUSD", { iv: soglia - 5 })!;
    expect(com.affidabilita.esitoAtteso).toBe("stretta");
    expect(com.affidabilita.n).toBe(739);
    expect(com.affidabilita.quota).toBeCloseTo(0.604, 3);
  });

  it.each(TUTTI)("%s: il guadagno esposto coincide con quota meno base rate", (s) => {
    const soglia = tabella.strumenti[s].riferimento.soglia_stato;
    for (const iv of [soglia + 5, soglia - 5]) {
      const l = leggiTermometro(s, { iv })!;
      expect(l.affidabilita.guadagnoPp).toBeCloseTo(
        (l.affidabilita.quota - l.affidabilita.baseRate) * 100,
        1,
      );
    }
  });

  it("le percentuali a schermo vengono dalla storia completa, non dall'holdout", () => {
    const soglia = tabella.strumenti.XAUUSD.riferimento.soglia_stato;
    const com = leggiTermometro("XAUUSD", { iv: soglia - 5 })!;
    const oos = tabella.strumenti.XAUUSD.validazione_out_of_sample;
    expect(oos.COMPRESSA.n).toBe(28);
    expect(com.affidabilita.n).toBeGreaterThan(500);
    expect(oos.COMPRESSA.base_rate_esito_atteso).toBeLessThan(0.2);
    expect(com.affidabilita.baseRate).toBeGreaterThan(0.4);
  });

  it("il periodo di calcolo è distinto dalla tabella e dalla validazione", () => {
    const l = leggiTermometro("XAUUSD", { iv: 30 })!;
    const m = metaTermometro();
    expect(l.affidabilita.calcolataDa).toBe("2021-07-01");
    expect(l.affidabilita.calcolataFinoA).toBe("2026-07-27");
    // sui tre strumenti gestiti i dati finiscono prima della generazione della tabella:
    // i due campi restano concettualmente distinti anche quando su altri coincidono
    expect(l.affidabilita.calcolataFinoA).not.toBe(m.generatoIl);
    expect(m.affidabilitaDa < m.validazioneDa).toBe(true);
  });

  it.each(TUTTI)("%s: il calcolo non può finire dopo la generazione della tabella", (s) => {
    const a = tabella.strumenti[s].affidabilita;
    expect(a.calcolata_fino_a <= tabella.generato_il).toBe(true);
    expect(a.calcolata_da < a.calcolata_fino_a).toBe(true);
  });

  it("senza chiusura non produce la cifra in valuta ma mantiene la relativa", () => {
    const l = leggiTermometro("XAUUSD", { iv: 30 })!;
    expect(l.ampiezzaValuta).toBeNull();
    expect(l.motivoValutaAssente).toBe("chiusura_assente");
    expect(l.ampiezzaRelativa.mediana).toBeGreaterThan(0);
  });

  it("con la chiusura scala l'ampiezza relativa in unità di prezzo", () => {
    const close = 4000;
    const l = leggiTermometro("XAUUSD", { iv: 30, close })!;
    expect(l.ampiezzaValuta!.mediana).toBeCloseTo(l.ampiezzaRelativa.mediana * close, 8);
    expect(l.motivoValutaAssente).toBeNull();
  });

  it("la cifra in valuta segue il livello di prezzo, non è congelata", () => {
    const a = leggiTermometro("GER40", { iv: 25, close: 15000 })!;
    const b = leggiTermometro("GER40", { iv: 25, close: 24000 })!;
    expect(b.ampiezzaValuta!.mediana / a.ampiezzaValuta!.mediana).toBeCloseTo(24000 / 15000, 8);
  });

  it("una chiusura non valida viene ignorata", () => {
    expect(leggiTermometro("XAUUSD", { iv: 30, close: 0 })!.ampiezzaValuta).toBeNull();
    expect(leggiTermometro("XAUUSD", { iv: 30, close: -5 })!.ampiezzaValuta).toBeNull();
  });

  it("lo S&P 500 mostra l'ampiezza in punti indice con una chiusura plausibile", () => {
    const l = leggiTermometro("SP500", { iv: 20, close: 7509 })!;
    expect(l.unita).toBe("punti indice");
    expect(l.ampiezzaValuta).not.toBeNull();
    expect(l.ampiezzaValuta!.mediana).toBeCloseTo(l.ampiezzaRelativa.mediana * 7509, 8);
  });
});

describe("guardia di plausibilità del prezzo", () => {
  // In questo progetto un bug del punto decimale ha già mandato in produzione valori ×1000
  // sul DV1X: una chiusura fuori scala non deve produrre una cifra in valuta sbagliata.
  it.each([
    ["SP500", 20, 750900],
    ["XAUUSD", 30, 4_000_000],
    ["GER40", 25, 240],
    ["WTICOUSD", 40, 6500],
  ] as const)("%s: una chiusura fuori banda ricade sulla percentuale", (s, iv, close) => {
    const l = leggiTermometro(s, { iv, close })!;
    expect(l.ampiezzaValuta).toBeNull();
    expect(l.motivoValutaAssente).toBe("chiusura_implausibile");
    expect(l.ampiezzaRelativa.mediana).toBeGreaterThan(0);
  });

  it("distingue la chiusura assente da quella implausibile", () => {
    expect(leggiTermometro("SP500", { iv: 20 })!.motivoValutaAssente).toBe("chiusura_assente");
    expect(leggiTermometro("SP500", { iv: 20, close: 12 })!.motivoValutaAssente).toBe(
      "chiusura_implausibile",
    );
  });
});

describe("estraiIvDaVolPanel", () => {
  it("legge GVZ, OVX e VIX dal pannello con i decimali all'italiana", () => {
    const out = estraiIvDaVolPanel([
      { k: "VIX · vol S&P500", v: "18,65" },
      { k: "GVZ · vol oro", v: "25,37" },
      { k: "OVX · vol petrolio", v: "62,07" },
    ]);
    expect(out.XAUUSD.iv).toBeCloseTo(25.37, 6);
    expect(out.WTICOUSD.iv).toBeCloseTo(62.07, 6);
    expect(out.SP500.iv).toBeCloseTo(18.65, 6);
    expect(out.GER40).toBeUndefined();
  });

  it("non confonde il VIX con VVIX, VIX1D e VIX9D", () => {
    const out = estraiIvDaVolPanel([
      { k: "VVIX · vol del VIX", v: "102,82" },
      { k: "VIX1D", v: "13,40" },
      { k: "VIX9D", v: "17,80" },
    ]);
    expect(out.SP500).toBeUndefined();
  });

  it("prende il VIX anche quando VVIX lo precede nel pannello", () => {
    const out = estraiIvDaVolPanel([
      { k: "VVIX · vol del VIX", v: "102,82" },
      { k: "SKEW · TAIL RISK", v: "146,05" },
      { k: "VIX · vol S&P500", v: "18,65" },
    ]);
    expect(out.SP500.iv).toBeCloseTo(18.65, 6);
  });

  it("non inventa valori quando il pannello manca o è vuoto", () => {
    expect(estraiIvDaVolPanel(undefined)).toEqual({});
    expect(estraiIvDaVolPanel([{ k: "GVZ", v: undefined }])).toEqual({});
    expect(estraiIvDaVolPanel([{ k: "GVZ", v: "n/d" }])).toEqual({});
  });
});

describe("estraiChiusureDaBiasRecord", () => {
  // Forma REALE: `assets` come dizionario per chiave asset (vedi
  // parseWeeklyBiasRecord). La vecchia versione di questo fixture usava un
  // array mai esistito in produzione.
  const record = {
    weekStart: "2026-07-26",
    assets: {
      xau: {
        bias: "RIALZISTA",
        path: [
          { date: "2026-07-24", px: 4048.9, move_EM: 0.1 },
          { date: "2026-07-27", px: 4076.4, move_EM: 0.2 },
          { date: "2026-07-23", px: 4010.0, move_EM: 0 },
        ],
      },
      wti: {
        bias: "NEUTRALE",
        path: [{ date: "2026-07-27", px: 64.93, move_EM: 0 }],
      },
      idx: {
        bias: "RIALZISTA",
        path: [{ date: "2026-07-27", px: 7509, move_EM: 0 }],
      },
    },
  };

  it("prende l'ultimo punto per data, non l'ultimo dell'array", () => {
    expect(estraiChiusureDaBiasRecord(record).XAUUSD).toBeCloseTo(4076.4, 6);
  });

  it("mappa idx sull'S&P 500, verificato sull'output del desk", () => {
    expect(estraiChiusureDaBiasRecord(record).SP500).toBeCloseTo(7509, 6);
  });

  it("NON mappa idx su GER40: è l'S&P 500, non il DAX", () => {
    expect(estraiChiusureDaBiasRecord(record).GER40).toBeUndefined();
    expect(Object.keys(estraiChiusureDaBiasRecord(record)).sort()).toEqual([
      "SP500",
      "WTICOUSD",
      "XAUUSD",
    ]);
  });

  it("ignora punti senza prezzo utilizzabile", () => {
    expect(
      estraiChiusureDaBiasRecord({
        weekStart: "2026-07-26",
        assets: {
          xau: {
            bias: "RIALZISTA",
            path: [{ date: "2026-07-27", px: Number.NaN, move_EM: 0 }],
          },
        },
      }),
    ).toEqual({});
    expect(
      estraiChiusureDaBiasRecord({
        weekStart: "2026-07-26",
        assets: {
          xau: {
            bias: "RIALZISTA",
            path: [{ date: "2026-07-27", px: 0, move_EM: 0 }],
          },
        },
      }),
    ).toEqual({});
    expect(estraiChiusureDaBiasRecord(null)).toEqual({});
    expect(estraiChiusureDaBiasRecord(undefined)).toEqual({});
  });
});

describe("componiIngressi", () => {
  const volItems = [
    { k: "GVZ · vol oro", v: "24,30" },
    { k: "OVX · vol petrolio", v: "60,62" },
    { k: "VIX · vol S&P500", v: "18,65" },
  ];
  // Forma REALE del Weekly Bias Record: `assets` è un dizionario per chiave
  // asset, come lo invia il desk e come lo accetta parseWeeklyBiasRecord.
  // La vecchia versione di questo fixture usava un array di {asset, path}
  // mai esistito in produzione: i test erano verdi contro una forma finta.
  const biasRecord = {
    weekStart: "2026-07-26",
    assets: {
      xau: {
        bias: "RIALZISTA",
        path: [{ date: "2026-07-27", px: 4076.4, move_EM: 0 }],
      },
      idx: {
        bias: "NEUTRALE",
        path: [{ date: "2026-07-27", px: 7509, move_EM: 0 }],
      },
    },
  };

  it("unisce volatilità implicita e chiusura quando ci sono entrambe", () => {
    const i = componiIngressi({ volItems, biasRecord });
    expect(i.XAUUSD).toEqual({ iv: 24.3, close: 4076.4 });
    expect(i.SP500).toEqual({ iv: 18.65, close: 7509 });
  });

  it("senza bias record restano le sole volatilità implicite", () => {
    const i = componiIngressi({ volItems });
    expect(i.SP500.iv).toBeCloseTo(18.65, 6);
    expect(i.SP500.close).toBeUndefined();
  });

  it("una chiusura senza la corrispondente IV non crea un ingresso fantasma", () => {
    const i = componiIngressi({ volItems: [], biasRecord });
    expect(i.XAUUSD).toBeUndefined();
    expect(i.SP500).toBeUndefined();
  });

  it("il termometro composto produce la cifra in valuta", () => {
    const l = leggiTermometro("SP500", componiIngressi({ volItems, biasRecord }).SP500)!;
    expect(l.ampiezzaValuta).not.toBeNull();
    expect(l.ampiezzaValuta!.mediana).toBeCloseTo(l.ampiezzaRelativa.mediana * 7509, 6);
  });
});

/**
 * REGRESSIONE del guasto in produzione del 10-13/08/2026 (AI Analyst e
 * Volatilità in error boundary): il primo report DAILY con `biasRecord`
 * valorizzato portava `assets` come dizionario e il vecchio parsing ad hoc
 * (`for…of` su un oggetto) lanciava TypeError. Il fixture è il biasRecord
 * VERO di quel report, non una ricostruzione.
 */
describe("estraiChiusureDaBiasRecord — report DAILY reale (12/08/2026)", () => {
  it("non lancia e ricava le chiusure più recenti dal dict assets", () => {
    const chiusure = estraiChiusureDaBiasRecord(
      BIAS_RECORD_DAILY_REALE as Parameters<typeof estraiChiusureDaBiasRecord>[0],
    );
    expect(chiusure).toEqual({
      XAUUSD: 4404.7,
      WTICOUSD: 84,
      SP500: 7746.69,
    });
  });

  it("componiIngressi unisce IV del pannello reale e chiusure reali", () => {
    const ingressi = componiIngressi({
      volItems: VOL_ITEMS_DAILY_REALI as unknown as { k: string; v?: string }[],
      biasRecord: BIAS_RECORD_DAILY_REALE as Parameters<
        typeof componiIngressi
      >[0]["biasRecord"],
    });
    expect(ingressi.XAUUSD).toEqual({ iv: 26, close: 4404.7 });
    expect(ingressi.WTICOUSD).toEqual({ iv: 55, close: 84 });
    expect(ingressi.SP500).toEqual({ iv: 15.3, close: 7746.69 });
  });

  it("un biasRecord irriconoscibile degrada a nessuna chiusura, mai un lancio", () => {
    for (const spazzatura of [
      { assets: "non-un-contenitore" },
      { assets: 42 },
      { weekStart: "2026-08-09", assets: { xau: "stringa" } },
      "stringa",
      12,
      [{ asset: "xau" }],
    ]) {
      expect(() =>
        estraiChiusureDaBiasRecord(
          spazzatura as Parameters<typeof estraiChiusureDaBiasRecord>[0],
        ),
      ).not.toThrow();
    }
  });
});
