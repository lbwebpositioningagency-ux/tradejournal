import { describe, expect, it } from "vitest";
import {
  annoInizioCot,
  bucketDelGiorno,
  letturaCot,
  letturaDispersione,
  letturaIv,
  letturaIvMese,
  letturaLivelloTrends,
  letturaStabilita,
  letturaTermometro,
  mediana,
} from "@/lib/ai-analyst/letture";
import type { CartaCot, MetaCot } from "@/lib/cot-panel";
import type { DriverCardPayload } from "@/lib/driver-desk/cards";
import type { TrendsSeriesView } from "@/lib/macro-trends";
import { isoWeekday } from "@/lib/seasonality/buckets";
import type { BucketView } from "@/lib/seasonality/query";
import type { LetturaTermometro } from "@/lib/termometro-volatilita";

/**
 * Regola di questo file: ogni grandezza numerica che il motore di raccolta
 * estrae dal Macro Desk viene confrontata con una RICOSTRUZIONE INDIPENDENTE —
 * o una costante calcolata a mano e scritta qui, o la stessa quantità ottenuta
 * per un'altra strada. Mai richiamando la funzione che si sta testando.
 */

/* ── mediana ─────────────────────────────────────────────────────────── */

describe("mediana", () => {
  it("prende il centrale su lista dispari, la media dei due centrali su pari", () => {
    expect(mediana([44, 12, 88])).toBe(44);
    expect(mediana([10, 40, 20, 30])).toBe(25);
    expect(mediana([7])).toBe(7);
  });

  it("non altera la lista in ingresso", () => {
    const originale = [3, 1, 2];
    mediana(originale);
    expect(originale).toEqual([3, 1, 2]);
  });
});

/* ── COT ─────────────────────────────────────────────────────────────── */

const CARTA_OI: CartaCot = {
  strumento: "GOLD",
  nomeStrumento: "ORO",
  metrica: "open_interest",
  etichetta: "Partecipazione",
  valore: 512_340,
  posizioneBarra: 74.6,
  banda: "ALTO",
  rigaPrincipale: "Più alto che nel 75% delle settimane dal 2017",
  rigaRarita: null,
  delta4Settimane: 7912,
  ultimaVoltaSimile: "2025-11-04",
  aggiornatoAl: "2026-07-21",
};

const META: MetaCot = {
  aggiornatoAl: "2026-07-21",
  giorniDaAggiornamento: 14,
  stantio: false,
  finestraRiferimento: "2017 → oggi",
  settimaneRiferimento: 496,
  fonte: "CFTC",
};

describe("annoInizioCot", () => {
  it("estrae l'anno dalla finestra di riferimento del pannello", () => {
    expect(annoInizioCot("2017 → oggi", "2026-07-21")).toBe(2017);
  });

  it("ricade sull'anno del dato corrente se il formato cambia", () => {
    expect(annoInizioCot("dal 2017", "2026-07-21")).toBe(2026);
    expect(annoInizioCot(undefined, "2026-07-21")).toBe(2026);
  });
});

describe("letturaCot", () => {
  it("copia i numeri della carta senza toccarli", () => {
    const l = letturaCot("ORO", "open_interest", [CARTA_OI], META);
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.dataDato).toBe("2026-07-21");
    expect(l.valore.posizioneBarra).toBe(74.6);
    expect(l.valore.banda).toBe("ALTO");
    expect(l.valore.delta4Settimane).toBe(7912);
    expect(l.valore.annoInizio).toBe(2017);
    expect(l.valore.settimane).toBe(496);
  });

  it("è non applicabile dove la CFTC non pubblica", () => {
    expect(letturaCot("DAX", "open_interest", [CARTA_OI], META)).toEqual({
      ok: false,
      motivo: "non_applicabile",
    });
    expect(letturaCot("SP500", "mm_net", [CARTA_OI], META)).toEqual({
      ok: false,
      motivo: "non_applicabile",
    });
  });

  it("distingue pannello vuoto (fonte giù) da carta mancante (warm-up)", () => {
    expect(letturaCot("ORO", "open_interest", [], null)).toEqual({
      ok: false,
      motivo: "fonte_non_disponibile",
    });
    // Pannello popolato ma senza la carta mm_net: serie sotto le 156 settimane.
    expect(letturaCot("ORO", "mm_net", [CARTA_OI], META)).toEqual({
      ok: false,
      motivo: "campione_insufficiente",
    });
  });
});

/* ── Trends ──────────────────────────────────────────────────────────── */

function vistaTrends(over: Partial<TrendsSeriesView> = {}): TrendsSeriesView {
  return {
    def: {
      key: "gvz",
      fredIds: ["GVZCLS"],
      section: "volatilita",
      label: "GVZ (vol oro)",
      unit: "",
      transform: "level",
      decimals: 2,
      cadence: "daily",
      goodDirection: "down",
      deltaMode: "abs",
      reading: "nota di lettura del registry — NON deve finire nel dossier",
    },
    status: "ok",
    points: [],
    latestDate: "2026-08-03",
    latestValue: 18.42,
    percentiles: { y1: 78, y3: 61, y5: 55 },
    metrics: {
      trend: "rialzista",
      trendZ: 1.9,
      changes: [
        { label: "1S", value: 0.91, pct: false },
        { label: "1M", value: -1.2, pct: false },
      ],
      percentile: 64,
      historyStartYear: "2008",
      cycle: null,
      levelZ: null,
    },
    ...over,
  };
}

describe("letturaIv", () => {
  it("prende livello, percentili e le due variazioni giuste", () => {
    const l = letturaIv("ORO", vistaTrends());
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.dataDato).toBe("2026-08-03");
    expect(l.valore.livello).toBe(18.42);
    expect(l.valore.pct1).toBe(78);
    expect(l.valore.pct3).toBe(61);
    expect(l.valore.pct5).toBe(55);
    expect(l.valore.var1S).toBe(0.91);
    expect(l.valore.var1M).toBe(-1.2);
    expect(l.valore.proxy).toBe(false);
  });

  it("dichiara il sostituto quando l'indice non è quello dello strumento", () => {
    const l = letturaIv("DAX", vistaTrends());
    expect(l.ok && l.valore.proxy).toBe(true);
    expect(l.ok && l.valore.etichetta).toBe("VIX");
  });

  it("non porta nel dossier nessuna nota di lettura del registry", () => {
    const l = letturaIv("ORO", vistaTrends());
    expect(JSON.stringify(l)).not.toContain("nota di lettura");
  });

  it("degrada quando la serie è in errore o senza ultimo valore", () => {
    expect(letturaIv("ORO", undefined)).toEqual({
      ok: false,
      motivo: "fonte_non_disponibile",
    });
    expect(
      letturaIv("ORO", vistaTrends({ status: "error", latestValue: undefined })),
    ).toEqual({ ok: false, motivo: "fonte_non_disponibile" });
  });

  it("i percentili assenti restano null, mai zero", () => {
    const l = letturaIv("ORO", vistaTrends({ percentiles: undefined }));
    expect(l.ok && l.valore.pct1).toBeNull();
    expect(l.ok && l.valore.pct3).toBeNull();
  });
});

describe("letturaLivelloTrends", () => {
  it("legge livello, percentile di regime e variazione settimanale", () => {
    const l = letturaLivelloTrends(
      vistaTrends({
        def: { ...vistaTrends().def, key: "nfci", label: "Condizioni finanziarie (NFCI)" },
        latestValue: -0.51,
      }),
    );
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.valore.livello).toBe(-0.51);
    expect(l.valore.percentile).toBe(64);
    expect(l.valore.var1S).toBe(0.91);
    expect(l.valore.etichetta).toBe("Condizioni finanziarie (NFCI)");
  });
});

/* ── Stagionalità ────────────────────────────────────────────────────── */

function bucket(over: Partial<BucketView> = {}): BucketView {
  return {
    bucket: 8,
    n: 20,
    mean: 0.0041,
    median: 0.0038,
    stdev: 0.0423,
    positiveShare: 0.6,
    p25: -0.025,
    p75: 0.031,
    rawCount: 440,
    withinSigma: 0.7,
    firstDate: "2006-08-01",
    lastDate: "2025-08-29",
    quality: "ok",
    ...over,
  };
}

describe("letturaDispersione", () => {
  const l = letturaDispersione({
    riga: bucket(),
    granularita: "MESE",
    etichettaBucket: "Agosto",
    anniFinestra: 20,
    archivioAl: "2026-08-02",
  });

  it("converte la dispersione in punti percentuali (×100), non con expm1", () => {
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    // Ricostruzione indipendente: 0,0423 × 100 = 4,23 punti percentuali.
    expect(l.valore.stdevPct).toBeCloseTo(4.23, 10);
  });

  it("l'ampiezza fra 25° e 75° è la differenza dei due quantili convertiti", () => {
    if (!l.ok) return;
    // Ricostruzione indipendente per un'altra strada: exp(x) − 1 invece di
    // expm1(x). Valore atteso calcolato a parte: 5,617559185819…
    const atteso = (Math.exp(0.031) - 1) * 100 - (Math.exp(-0.025) - 1) * 100;
    expect(l.valore.iqrPct).toBeCloseTo(atteso, 9);
    expect(l.valore.iqrPct).toBeCloseTo(5.617559185819, 9);
  });

  it("porta con sé numerosità, qualità e finestra del campione", () => {
    if (!l.ok) return;
    expect(l.valore.n).toBe(20);
    expect(l.valore.quality).toBe("ok");
    expect(l.valore.primoAnno).toBe("2006");
    expect(l.valore.ultimoAnno).toBe("2025");
    expect(l.valore.anniFinestra).toBe(20);
  });

  it("data del dato = freschezza dell'archivio, non ultima data del bucket", () => {
    // Il bucket di agosto finisce ad agosto dell'anno scorso PER COSTRUZIONE
    // (l'anno in corso è escluso dalle medie): usarla come data del dato
    // farebbe scartare la Stagionalità ogni singolo giorno.
    if (!l.ok) return;
    expect(l.dataDato).toBe("2026-08-02");
    expect(l.dataDato).not.toBe("2025-08-29");
  });

  it("non porta media, mediana né quota di anni positivi: sono direzionali", () => {
    if (!l.ok) return;
    const chiavi = Object.keys(l.valore);
    expect(chiavi).not.toContain("mean");
    expect(chiavi).not.toContain("median");
    expect(chiavi).not.toContain("positiveShare");
    expect(JSON.stringify(l.valore)).not.toContain("0.0041");
  });

  it("dichiara il campione insufficiente invece di pubblicare rumore", () => {
    expect(
      letturaDispersione({
        riga: bucket({ n: 3, quality: "critical" }),
        granularita: "MESE",
        etichettaBucket: "Agosto",
        anniFinestra: 20,
        archivioAl: "2026-08-02",
      }),
    ).toEqual({ ok: false, motivo: "campione_insufficiente" });
  });

  it("sabato e domenica non sono un dato mancante: non esistono in tabella", () => {
    expect(
      letturaDispersione({
        riga: undefined,
        granularita: "GIORNO",
        etichettaBucket: null,
        anniFinestra: 20,
        archivioAl: "2026-08-02",
      }),
    ).toEqual({ ok: false, motivo: "non_applicabile" });
  });

  it("archivio assente o riga mancante = fonte non disponibile", () => {
    expect(
      letturaDispersione({
        riga: bucket(),
        granularita: "MESE",
        etichettaBucket: "Agosto",
        anniFinestra: 20,
        archivioAl: null,
      }),
    ).toEqual({ ok: false, motivo: "fonte_non_disponibile" });
    expect(
      letturaDispersione({
        riga: undefined,
        granularita: "MESE",
        etichettaBucket: "Agosto",
        anniFinestra: 20,
        archivioAl: "2026-08-02",
      }),
    ).toEqual({ ok: false, motivo: "fonte_non_disponibile" });
  });

  it("la dispersione non definita resta null, mai zero", () => {
    const senza = letturaDispersione({
      riga: bucket({ stdev: null }),
      granularita: "MESE",
      etichettaBucket: "Agosto",
      anniFinestra: 20,
      archivioAl: "2026-08-02",
    });
    expect(senza.ok && senza.valore.stdevPct).toBeNull();
  });
});

describe("letturaIvMese", () => {
  it("porta il livello medio dell'indice nel mese, così com'è", () => {
    const l = letturaIvMese({
      strumento: "ORO",
      riga: bucket({ mean: 17.14, stdev: 3.2, p25: 14.1, p75: 19.8 }),
      mese: 8,
      anniFinestra: 20,
      archivioAl: "2026-07-31",
    });
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    // Un LIVELLO non si converte: 17,14 resta 17,14.
    expect(l.valore.media).toBe(17.14);
    expect(l.valore.mese).toBe("Agosto");
    expect(l.valore.etichetta).toBe("GVZ");
    expect(l.dataDato).toBe("2026-07-31");
  });

  it("per il DAX dichiara che l'indice è un sostituto", () => {
    const l = letturaIvMese({
      strumento: "DAX",
      riga: bucket({ mean: 17.14 }),
      mese: 8,
      anniFinestra: 20,
      archivioAl: "2026-07-31",
    });
    expect(l.ok && l.valore.proxy).toBe(true);
    expect(l.ok && l.valore.etichetta).toBe("VIX");
  });
});

describe("bucketDelGiorno", () => {
  it("il mese è quello della data civile", () => {
    expect(bucketDelGiorno("2026-08-04", "MESE", isoWeekday)).toEqual({
      bucket: 8,
      etichetta: "Agosto",
    });
    expect(bucketDelGiorno("2026-01-31", "MESE", isoWeekday)).toEqual({
      bucket: 1,
      etichetta: "Gennaio",
    });
  });

  it("il giorno della settimana usa la numerazione ISO lunedì=1", () => {
    // Ricostruzione indipendente: 2026-08-04 è un martedì
    // (Date.UTC(2026,7,4).getUTCDay() === 2, con 0 = domenica).
    expect(new Date(Date.UTC(2026, 7, 4)).getUTCDay()).toBe(2);
    expect(bucketDelGiorno("2026-08-04", "GIORNO", isoWeekday)).toEqual({
      bucket: 2,
      etichetta: "Martedì",
    });
  });

  it("sabato e domenica non hanno bucket", () => {
    expect(new Date(Date.UTC(2026, 7, 8)).getUTCDay()).toBe(6); // sabato
    expect(new Date(Date.UTC(2026, 7, 9)).getUTCDay()).toBe(0); // domenica
    expect(bucketDelGiorno("2026-08-08", "GIORNO", isoWeekday)).toBeNull();
    expect(bucketDelGiorno("2026-08-09", "GIORNO", isoWeekday)).toBeNull();
  });
});

/* ── Driver Desk ─────────────────────────────────────────────────────── */

function scheda(percentili: (number | null)[]): DriverCardPayload {
  return {
    id: "ORO",
    label: "Oro",
    ticker: "XAU/USD",
    colorToken: "var(--md-gold)",
    calendar: {
      start: "2015-01-05",
      end: "2026-08-04",
      sessions: 2871,
      dropped: [],
    },
    chart: null,
    guide: [],
    relations: percentili.map((p, i) => ({
      label: `rel${i}`,
      role: "driver" as const,
      rho: -0.62,
      percentile: p,
      band: null,
      sentence: "frase con segno — NON deve finire nel dossier",
      signSentence: "si sono mossi in direzioni opposte — vietata",
    })),
  };
}

describe("letturaStabilita", () => {
  it("prende la mediana dei percentili delle relazioni con confronto storico", () => {
    const l = letturaStabilita("ORO", scheda([88, 12, 44]));
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    // Ricostruzione indipendente: ordinati [12, 44, 88], il centrale è 44.
    expect(l.valore.percentileMediano).toBe(44);
    // Bande 10/30/70/90, le stesse del pannello COT: 44 sta in NELLA NORMA.
    expect(l.valore.banda).toBe("NELLA NORMA");
    expect(l.valore.nRelazioni).toBe(3);
    expect(l.valore.annoInizio).toBe("2015");
    expect(l.valore.sedute).toBe(2871);
    expect(l.dataDato).toBe("2026-08-04");
  });

  it("scarta le relazioni senza confronto storico", () => {
    const l = letturaStabilita("ORO", scheda([80, null, 90, null]));
    expect(l.ok && l.valore.nRelazioni).toBe(2);
    // Ordinati [80, 90]: mediana = (80 + 90) / 2 = 85 → banda ALTO (70-90).
    expect(l.ok && l.valore.percentileMediano).toBe(85);
    expect(l.ok && l.valore.banda).toBe("ALTO");
  });

  it("nessuna relazione confrontabile = campione insufficiente", () => {
    expect(letturaStabilita("ORO", scheda([null, null]))).toEqual({
      ok: false,
      motivo: "campione_insufficiente",
    });
  });

  it("non porta nel dossier né il segno né le frasi già composte", () => {
    const l = letturaStabilita("ORO", scheda([44]));
    const serializzato = JSON.stringify(l);
    expect(serializzato).not.toContain("direzioni opposte");
    expect(serializzato).not.toContain("frase con segno");
    expect(serializzato).not.toContain("-0.62");
  });

  it("l'S&P 500 non ha una scheda: non applicabile", () => {
    expect(letturaStabilita("SP500", scheda([44]))).toEqual({
      ok: false,
      motivo: "non_applicabile",
    });
  });
});

/* ── termometro ──────────────────────────────────────────────────────── */

const TERMO: LetturaTermometro = {
  simbolo: "XAUUSD",
  etichetta: "Oro",
  indiceIv: "GVZ",
  unita: "$",
  decimaliPrezzo: 2,
  decimaliIv: 2,
  iv: 18.42,
  posizione: { modalita: "puntuale", percentile: 78.5 },
  stato: "ESPANSA",
  finestraSchermo: "2014 → oggi",
  finestraCorta: false,
  ruolo: "strumento_tradato",
  notaRuolo: null,
  soloContesto: false,
  ampiezzaRelativa: { mediana: 0.0161, q25: 0.0108, q75: 0.0234 },
  ampiezzaValuta: { mediana: 64.4, q25: 43.2, q75: 93.6 },
  motivoValutaAssente: null,
  affidabilita: {
    esitoAtteso: "ampia",
    quota: 0.71,
    baseRate: 0.5,
    guadagnoPp: 21,
    n: 1234,
    calcolataDa: "2014-01-02",
    calcolataFinoA: "2025-12-31",
  },
  persistenza: { quotaInvariati: 0.82, durataMediaGiorni: 5.4 },
};

describe("letturaTermometro", () => {
  it("spacchetta le tre facce con la data del report", () => {
    const l = letturaTermometro("ORO", TERMO, "2026-08-03");
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.dataDato).toBe("2026-08-03");
    expect(l.valore.stato.stato).toBe("ESPANSA");
    expect(l.valore.stato.iv).toBe(18.42);
    expect(l.valore.ampiezza.relativa.mediana).toBe(0.0161);
    expect(l.valore.ampiezza.valuta?.mediana).toBe(64.4);
    expect(l.valore.affidabilita.quota).toBe(0.71);
    expect(l.valore.affidabilita.baseRate).toBe(0.5);
    expect(l.valore.affidabilita.guadagnoPp).toBe(21);
    expect(l.valore.affidabilita.persistenza?.durataMediaGiorni).toBe(5.4);
  });

  it("porta sempre il base rate accanto alla quota, mai la quota da sola", () => {
    const l = letturaTermometro("ORO", TERMO, "2026-08-03");
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.valore.affidabilita).toHaveProperty("baseRate");
    // La differenza dichiarata coincide con quota − base rate in punti:
    // 0,71 − 0,50 = 0,21 → 21 pp.
    expect(l.valore.affidabilita.guadagnoPp).toBeCloseTo(
      (0.71 - 0.5) * 100,
      10,
    );
  });

  it("il DAX è non applicabile: nessun indice di volatilità nel pannello", () => {
    expect(letturaTermometro("DAX", TERMO, "2026-08-03")).toEqual({
      ok: false,
      motivo: "non_applicabile",
    });
  });

  it("senza report o senza lettura degrada, non inventa", () => {
    expect(letturaTermometro("ORO", TERMO, null)).toEqual({
      ok: false,
      motivo: "fonte_non_disponibile",
    });
    expect(letturaTermometro("ORO", null, "2026-08-03")).toEqual({
      ok: false,
      motivo: "fonte_non_disponibile",
    });
  });

  it("conserva il motivo per cui la cifra in valuta manca", () => {
    const l = letturaTermometro(
      "ORO",
      { ...TERMO, ampiezzaValuta: null, motivoValutaAssente: "chiusura_implausibile" },
      "2026-08-03",
    );
    expect(l.ok && l.valore.ampiezza.valuta).toBeNull();
    expect(l.ok && l.valore.ampiezza.motivoValutaAssente).toBe(
      "chiusura_implausibile",
    );
  });
});
