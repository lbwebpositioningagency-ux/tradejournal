import { describe, expect, it } from "vitest";
import { applicaImpegno, riassuntoRifiuti } from "@/lib/macro-desk-impegno";
import {
  parseWeeklyBiasRecord,
  type WeeklyBiasRecord,
} from "@/lib/macro-desk-bias-record";
import { BIAS_RECORD_DAILY_REALE } from "@/lib/report-daily.fixture";

/**
 * L'IMPEGNO DELLA DOMENICA.
 *
 * Il Weekly Bias Record è una dichiarazione: questo bias, questo prezzo di
 * riferimento, questo Expected Move, queste soglie. La Scorecard misura
 * quanto abbia retto. Se un daily può riscriverla a settimana aperta, la
 * Scorecard misura l'ultima versione e il track record non vale niente.
 *
 * Il fixture è un report DAILY di produzione (13/08/2026): si parte da lì
 * invece che da un oggetto inventato, così i test attraversano il parser vero
 * e la forma vera — `assets` è un dizionario, non un array.
 */

const DOMENICA = parseWeeklyBiasRecord(BIAS_RECORD_DAILY_REALE)!;

/** Copia profonda: i test modificano il record in arrivo, mai l'archivio. */
function copia(record: WeeklyBiasRecord): WeeklyBiasRecord {
  return JSON.parse(JSON.stringify(record)) as WeeklyBiasRecord;
}

function asset(record: WeeklyBiasRecord, nome: string) {
  return record.assets.find((a) => a.asset === nome)!;
}

describe("il fixture è quello vero, e ha di che essere protetto", () => {
  it("porta tre asset, con p0, em e almeno un ramo", () => {
    expect(DOMENICA.weekStart).toBe("2026-08-09");
    expect(DOMENICA.assets.length).toBeGreaterThanOrEqual(3);
    const idx = asset(DOMENICA, "idx");
    expect(idx.p0).toBe(7757.64);
    expect(idx.em).toBe(159.97);
    expect(idx.branches.length).toBeGreaterThan(0);
  });
});

describe("settimana NUOVA: passa tutto, non c'è niente da proteggere", () => {
  it("senza archivio il record entra intero", () => {
    const esito = applicaImpegno(null, DOMENICA);
    expect(esito.rifiutate).toEqual([]);
    expect(esito.record).toEqual(DOMENICA);
  });

  it("con un archivio di UN'ALTRA settimana il record entra intero", () => {
    /* È la domenica successiva: l'impegno nuovo sostituisce il vecchio, ed è
       esattamente ciò che deve succedere. */
    const nuova = copia(DOMENICA);
    nuova.weekStart = "2026-08-16";
    asset(nuova, "idx").p0 = 7800;
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, nuova);
    expect(esito.rifiutate).toEqual([]);
    expect(asset(esito.record, "idx").p0).toBe(7800);
  });

  it("un archivio illeggibile non blocca nulla: il parser è difensivo", () => {
    for (const spazzatura of [undefined, "non è un record", 42, { a: 1 }]) {
      const esito = applicaImpegno(spazzatura, DOMENICA);
      expect(esito.rifiutate).toEqual([]);
      expect(esito.record).toEqual(DOMENICA);
    }
  });
});

describe("settimana APERTA: i campi dell'impegno non si toccano", () => {
  it("il BIAS non si cambia a settimana aperta", () => {
    const daily = copia(DOMENICA);
    asset(daily, "idx").bias = "RIBASSISTA";
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").bias).toBe("RIALZISTA");
    expect(esito.rifiutate).toContainEqual({
      campo: "idx.bias",
      tenuto: "RIALZISTA",
      rifiutato: "RIBASSISTA",
    });
  });

  it("il PREZZO DI RIFERIMENTO non si cambia: è il denominatore di tutto", () => {
    const daily = copia(DOMENICA);
    asset(daily, "idx").p0 = 7700;
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").p0).toBe(7757.64);
    expect(esito.rifiutate).toContainEqual({
      campo: "idx.p0",
      tenuto: "7757.64",
      rifiutato: "7700",
    });
  });

  it("l'EXPECTED MOVE non si cambia: cambiarlo riscala ogni misura in EM", () => {
    const daily = copia(DOMENICA);
    asset(daily, "idx").em = 200;
    asset(daily, "idx").emSource = "model";
    asset(daily, "idx").ivUsed = 18;
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    const idx = asset(esito.record, "idx");
    expect(idx.em).toBe(159.97);
    expect(idx.ivUsed).toBe(14.9);
    expect(esito.rifiutate.map((r) => r.campo)).toEqual(
      expect.arrayContaining(["idx.em", "idx.emSource", "idx.ivUsed"]),
    );
  });

  it("la CONFIDENZA non si cambia: è parte della dichiarazione", () => {
    const daily = copia(DOMENICA);
    const prima = asset(DOMENICA, "idx").confidence;
    asset(daily, "idx").confidence = 99;
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").confidence).toBe(prima);
  });

  it("la SOGLIA DI UN RAMO non si sposta", () => {
    const daily = copia(DOMENICA);
    const ramo = asset(daily, "idx").branches[0];
    const originale = asset(DOMENICA, "idx").branches[0].condition;
    ramo.condition = "chiusura settimanale sotto 7.000";
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").branches[0].condition).toBe(originale);
    expect(
      esito.rifiutate.some((r) => r.campo === `idx.ramo[${ramo.id}].condition`),
    ).toBe(true);
  });

  it("la fine della finestra non si sposta", () => {
    const daily = copia(DOMENICA);
    daily.windowEnd = "2026-08-21";
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(esito.record.windowEnd).toBe(DOMENICA.windowEnd);
    expect(esito.rifiutate).toContainEqual({
      campo: "windowEnd",
      tenuto: String(DOMENICA.windowEnd),
      rifiutato: "2026-08-21",
    });
  });
});

describe("il monitoraggio invece passa: è il motivo per cui i daily esistono", () => {
  it("stato dell'asset, MFE, MAE e percorso si aggiornano", () => {
    const daily = copia(DOMENICA);
    const idx = asset(daily, "idx");
    idx.status = "branched";
    idx.mfeEm = 1.4;
    idx.maeEm = -0.2;
    idx.path = [...idx.path, { date: "2026-08-14", px: 7900, moveEm: 0.89 }];

    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    const salvato = asset(esito.record, "idx");
    expect(salvato.status).toBe("branched");
    expect(salvato.mfeEm).toBe(1.4);
    expect(salvato.maeEm).toBe(-0.2);
    expect(salvato.path).toHaveLength(idx.path.length);
    expect(esito.rifiutate).toEqual([]);
  });

  it("un ramo che scatta cambia stato, tenendo la propria soglia", () => {
    const daily = copia(DOMENICA);
    const ramo = asset(daily, "idx").branches[0];
    ramo.status = "triggered";
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").branches[0].status).toBe("triggered");
    expect(esito.rifiutate).toEqual([]);
  });

  it("l'ARMAMENTO di un'invalidazione passa, la sua condizione no", () => {
    const conInvalidazione = copia(DOMENICA);
    const bersaglio = conInvalidazione.assets.find(
      (a) => a.invalidations.length > 0,
    );
    if (!bersaglio) return; // il fixture non ne ha: niente da provare qui
    const originale = bersaglio.invalidations[0].condition;
    bersaglio.invalidations[0].status = "fired";
    bersaglio.invalidations[0].condition = "qualcosa d'altro";
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, conInvalidazione);
    const salvata = asset(esito.record, bersaglio.asset).invalidations[0];
    expect(salvata.status).toBe("fired");
    expect(salvata.condition).toBe(originale);
  });
});

describe("niente si aggiunge e niente sparisce a settimana aperta", () => {
  it("un RAMO NUOVO non entra: sarebbe un impegno preso dopo aver visto", () => {
    const daily = copia(DOMENICA);
    asset(daily, "idx").branches.push({
      id: "b99",
      event: "inventato",
      condition: "sopra 8.000",
      effect: "RIALZISTA",
      status: "pending",
    });
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").branches.some((b) => b.id === "b99")).toBe(
      false,
    );
    expect(
      esito.rifiutate.some((r) => r.campo === "idx.ramo[b99]"),
    ).toBe(true);
  });

  it("un RAMO SPARITO resta: un impegno che si accorcia non sbaglia mai", () => {
    const daily = copia(DOMENICA);
    const quanti = asset(DOMENICA, "idx").branches.length;
    asset(daily, "idx").branches = [];
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").branches).toHaveLength(quanti);
  });

  it("un ASSET SPARITO resta com'era", () => {
    const daily = copia(DOMENICA);
    daily.assets = daily.assets.filter((a) => a.asset !== "idx");
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, daily);
    expect(asset(esito.record, "idx").p0).toBe(7757.64);
    expect(esito.record.assets).toHaveLength(DOMENICA.assets.length);
  });
});

describe("un daily onesto non produce nessun rifiuto", () => {
  it("rispedire lo stesso record identico è silenzioso", () => {
    const esito = applicaImpegno(BIAS_RECORD_DAILY_REALE, copia(DOMENICA));
    expect(esito.rifiutate).toEqual([]);
    expect(esito.record).toEqual(DOMENICA);
  });
});

describe("riassuntoRifiuti — la riga di log dice cosa, non «è successo»", () => {
  it("nomina campo, valore tenuto e valore rifiutato", () => {
    const daily = copia(DOMENICA);
    asset(daily, "idx").p0 = 7700;
    const riga = riassuntoRifiuti(
      applicaImpegno(BIAS_RECORD_DAILY_REALE, daily).rifiutate,
    );
    expect(riga).toContain("idx.p0");
    expect(riga).toContain("7757.64");
    expect(riga).toContain("7700");
  });

  it("senza rifiuti la riga è vuota, non «nessuno»", () => {
    expect(riassuntoRifiuti([])).toBe("");
  });
});
