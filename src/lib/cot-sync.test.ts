import { describe, expect, it, vi } from "vitest";

import {
  CONTRATTI_COT,
  parseCsvStoricoCot,
  parseRigheCftc,
  runCotSync,
  SOGLIA_RITARDO_GIORNI,
  urlCftc,
  type CodiceStrumentoCot,
  type CotSyncDb,
  type SettimanaCot,
} from "./cot-sync";

/**
 * Job di sync COT con dipendenze finte: niente rete, niente Postgres.
 * I vincoli sotto test sono quelli della spec: append-only (mai sovrascrivere),
 * guardia sul nome contratto rinominato (mai crash, mai errore silenzioso),
 * "non aggiornato da N giorni" oltre soglia.
 */

/* ── fixture ────────────────────────────────────────────────────────── */

/** Riga come la restituisce davvero Socrata: numeri come stringhe, data
 * come floating timestamp. Valori reali del WTI al 21/07/2026. */
function rigaSocrata(data: string, oi = 1864487, mmLong = 187469, mmShort = 123490, prodLong = 673702, prodShort = 290352) {
  return {
    report_date_as_yyyy_mm_dd: `${data}T00:00:00.000`,
    open_interest_all: String(oi),
    m_money_positions_long_all: String(mmLong),
    m_money_positions_short_all: String(mmShort),
    prod_merc_positions_long: String(prodLong),
    prod_merc_positions_short: String(prodShort),
  };
}

/** Db finto in memoria: append-only come quello vero. */
function dbFinto(iniziale: Partial<Record<CodiceStrumentoCot, SettimanaCot[]>> = {}) {
  const tabella = new Map<CodiceStrumentoCot, Map<string, SettimanaCot>>();
  for (const [strumento, settimane] of Object.entries(iniziale)) {
    tabella.set(
      strumento as CodiceStrumentoCot,
      new Map(settimane.map((s) => [s.reportDate, s])),
    );
  }
  const db: CotSyncDb = {
    async ultimaSettimana(strumento) {
      const date = [...(tabella.get(strumento)?.keys() ?? [])].sort();
      return date[date.length - 1] ?? null;
    },
    async inserisciSettimane(strumento, settimane) {
      const perStrumento = tabella.get(strumento) ?? new Map<string, SettimanaCot>();
      tabella.set(strumento, perStrumento);
      let inserite = 0;
      for (const s of settimane) {
        if (!perStrumento.has(s.reportDate)) {
          perStrumento.set(s.reportDate, s);
          inserite += 1;
        }
      }
      return inserite;
    },
  };
  return { db, tabella };
}

const OGGI = new Date("2026-07-31T12:00:00Z");

const SETT_21: SettimanaCot = { reportDate: "2026-07-21", openInterest: 1864487, mmNet: 63979, prodNet: 383350 };
const SETT_14: SettimanaCot = { reportDate: "2026-07-14", openInterest: 1875496, mmNet: 61974, prodNet: 399298 };

/* ── urlCftc ────────────────────────────────────────────────────────── */

describe("urlCftc", () => {
  it("filtra sul nome esatto del contratto, codificato", () => {
    const url = urlCftc(CONTRATTI_COT.WTI);
    expect(url).toContain("publicreporting.cftc.gov/resource/72hh-3qpy.json");
    expect(decodeURIComponent(url)).toContain(
      "market_and_exchange_names = 'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE'",
    );
  });

  it("con `dopo` chiede solo le settimane successive, in ordine crescente", () => {
    const url = decodeURIComponent(urlCftc(CONTRATTI_COT.GOLD, "2026-07-21"));
    expect(url).toContain("report_date_as_yyyy_mm_dd > '2026-07-21T00:00:00.000'");
    expect(url).toContain("$order=report_date_as_yyyy_mm_dd ASC");
  });

  it("raddoppia gli apici nel nome (sintassi SoQL), mai query rotta", () => {
    const url = decodeURIComponent(urlCftc("CONTRATTO D'ESEMPIO"));
    expect(url).toContain("'CONTRATTO D''ESEMPIO'");
  });
});

/* ── parseRigheCftc ─────────────────────────────────────────────────── */

describe("parseRigheCftc", () => {
  it("normalizza le righe Socrata reali: netti = long − short, data ISO corta", () => {
    const [r] = parseRigheCftc([rigaSocrata("2026-07-21")]);
    expect(r).toEqual(SETT_21);
  });

  it("scarta le righe malformate senza buttare via le altre", () => {
    const righe = parseRigheCftc([
      rigaSocrata("2026-07-14", 1875496, 187469 - 187469 + 61974, 0, 399298, 0),
      { report_date_as_yyyy_mm_dd: "non-una-data", open_interest_all: "1" },
      { open_interest_all: "123" },
      null,
      "spazzatura",
      { ...rigaSocrata("2026-07-21"), m_money_positions_long_all: "boh" },
    ]);
    expect(righe).toHaveLength(1);
    expect(righe[0].reportDate).toBe("2026-07-14");
  });

  it("corpo non-array (errore API impaginato come oggetto) → nessuna riga, nessun lancio", () => {
    expect(parseRigheCftc({ error: true })).toEqual([]);
    expect(parseRigheCftc(undefined)).toEqual([]);
  });
});

/* ── parseCsvStoricoCot ─────────────────────────────────────────────── */

describe("parseCsvStoricoCot", () => {
  it("legge il formato del CSV storico", () => {
    const righe = parseCsvStoricoCot(
      "time,strumento,open_interest,mm_net,prod_net\n2017-01-03,GOLD,424673,36557,-73229\n2017-01-03,WTI,2073780,265042,214577\n",
    );
    expect(righe).toHaveLength(2);
    expect(righe[0]).toEqual({
      strumento: "GOLD",
      settimana: { reportDate: "2017-01-03", openInterest: 424673, mmNet: 36557, prodNet: -73229 },
    });
  });

  it("è STRETTO: header diverso, strumento ignoto o valori non interi fermano il seed", () => {
    expect(() => parseCsvStoricoCot("data,cose\n1,2")).toThrow(/Header/);
    expect(() =>
      parseCsvStoricoCot("time,strumento,open_interest,mm_net,prod_net\n2017-01-03,SILVER,1,2,3"),
    ).toThrow(/strumento sconosciuto/);
    expect(() =>
      parseCsvStoricoCot("time,strumento,open_interest,mm_net,prod_net\n2017-01-03,GOLD,1.5,2,3"),
    ).toThrow(/non interi/);
  });

  it("legge il CSV VERO in dati/ per intero", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const righe = parseCsvStoricoCot(
      readFileSync(join(process.cwd(), "dati", "COT_gold_wti.csv"), "utf8"),
    );
    // 499 settimane × 2 strumenti (2017-01-03 → 2026-07-21)
    expect(righe).toHaveLength(998);
    const ultimaWti = righe.filter((r) => r.strumento === "WTI").at(-1);
    expect(ultimaWti?.settimana).toEqual(SETT_21);
  });
});

/* ── runCotSync ─────────────────────────────────────────────────────── */

describe("runCotSync", () => {
  it("appende le settimane nuove dopo l'ultima salvata", async () => {
    const { db, tabella } = dbFinto({ GOLD: [SETT_14], WTI: [SETT_14] });
    const fetchJson = vi.fn<(url: string) => Promise<unknown>>(async () => [rigaSocrata("2026-07-21")]);

    const esito = await runCotSync(db, fetchJson, OGGI);

    expect(esito.ok).toBe(true);
    for (const s of esito.strumenti) {
      expect(s.esito).toBe("aggiornato");
      expect(s.inserite).toBe(1);
      expect(s.ultimaSettimana).toBe("2026-07-21");
    }
    expect(tabella.get("GOLD")?.size).toBe(2);
    // l'URL usato chiede solo le settimane dopo il 14/07
    expect(decodeURIComponent(fetchJson.mock.calls[0][0] as string)).toContain("> '2026-07-14");
  });

  it("secondo giro: nessuna settimana nuova, 0 inserite, mai duplicati (idempotente)", async () => {
    const { db, tabella } = dbFinto({ GOLD: [SETT_14, SETT_21], WTI: [SETT_14, SETT_21] });
    // filtro data attivo → nessuna riga; sonda senza filtro → il contratto esiste
    const fetchJson = vi.fn(async (url: string) =>
      decodeURIComponent(url).includes(">") ? [] : [rigaSocrata("2026-07-21")],
    );

    const esito = await runCotSync(db, fetchJson, OGGI);

    expect(esito.ok).toBe(true);
    for (const s of esito.strumenti) {
      expect(s.esito).toBe("gia_aggiornato");
      expect(s.inserite).toBe(0);
    }
    expect(tabella.get("WTI")?.size).toBe(2);
  });

  it("non sovrascrive MAI: righe con data ≤ ultima salvata vengono filtrate anche se l'API le rimanda", async () => {
    const originale = { ...SETT_21, openInterest: 1864487 };
    const { db, tabella } = dbFinto({ GOLD: [originale], WTI: [originale] });
    // API maleducata: rimanda anche la settimana già salvata, con valori DIVERSI
    const fetchJson = vi.fn(async () => [rigaSocrata("2026-07-21", 999)]);

    await runCotSync(db, fetchJson, OGGI);

    expect(tabella.get("GOLD")?.get("2026-07-21")?.openInterest).toBe(1864487);
  });

  it("GUARDIA rinomina: nome sparito → contratto_non_trovato, ultimo dato tenuto, nessun lancio", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, tabella } = dbFinto({ GOLD: [SETT_21], WTI: [SETT_21] });
    const fetchJson = vi.fn(async () => []); // né nuove né sonda: il nome non esiste più

    const esito = await runCotSync(db, fetchJson, OGGI);

    expect(esito.ok).toBe(false);
    for (const s of esito.strumenti) {
      expect(s.esito).toBe("contratto_non_trovato");
      expect(s.dettaglio).toContain("rinomina");
      expect(s.ultimaSettimana).toBe("2026-07-21"); // l'ultimo dato buono resta
    }
    expect(tabella.get("GOLD")?.size).toBe(1);
    expect(consoleError).toHaveBeenCalled(); // mai errore silenzioso
    consoleError.mockRestore();
  });

  it("errore di rete → errore_rete nel report, il job non lancia", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = dbFinto({ GOLD: [SETT_21], WTI: [SETT_21] });
    const fetchJson = vi.fn(async () => {
      throw new Error("CFTC ha risposto 503");
    });

    const esito = await runCotSync(db, fetchJson, OGGI);

    expect(esito.ok).toBe(false);
    for (const s of esito.strumenti) {
      expect(s.esito).toBe("errore_rete");
      expect(s.dettaglio).toContain("503");
    }
    consoleError.mockRestore();
  });

  it("dato fermo oltre soglia → 'non aggiornato da N giorni', anche senza errori", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const vecchia: SettimanaCot = { ...SETT_21, reportDate: "2026-07-01" };
    const { db } = dbFinto({ GOLD: [vecchia], WTI: [vecchia] });
    const fetchJson = vi.fn(async (url: string) =>
      decodeURIComponent(url).includes(">") ? [] : [rigaSocrata("2026-07-01")],
    );

    const esito = await runCotSync(db, fetchJson, OGGI); // 30 giorni dopo

    expect(esito.ok).toBe(false);
    for (const s of esito.strumenti) {
      expect(s.esito).toBe("gia_aggiornato");
      expect(s.nonAggiornatoDaGiorni).toBe(30);
      expect(s.nonAggiornatoDaGiorni).toBeGreaterThan(SOGLIA_RITARDO_GIORNI);
    }
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("non aggiornato da 30 giorni"));
    consoleError.mockRestore();
  });

  it("a regime (10 giorni dal martedì salvato) NESSUN falso allarme", async () => {
    const { db } = dbFinto({ GOLD: [SETT_21], WTI: [SETT_21] });
    const fetchJson = vi.fn(async (url: string) =>
      decodeURIComponent(url).includes(">") ? [] : [rigaSocrata("2026-07-21")],
    );

    const esito = await runCotSync(db, fetchJson, OGGI); // 21/07 → 31/07 = 10 giorni

    expect(esito.ok).toBe(true);
    expect(esito.strumenti.every((s) => s.nonAggiornatoDaGiorni === null)).toBe(true);
  });

  it("tabella vuota: prende tutto quello che l'API dà, senza filtro data", async () => {
    const { db, tabella } = dbFinto();
    const fetchJson = vi.fn<(url: string) => Promise<unknown>>(async () => [
      rigaSocrata("2026-07-14"),
      rigaSocrata("2026-07-21"),
    ]);

    const esito = await runCotSync(db, fetchJson, OGGI);

    expect(esito.strumenti.every((s) => s.esito === "aggiornato" && s.inserite === 2)).toBe(true);
    expect(tabella.get("GOLD")?.size).toBe(2);
    expect(decodeURIComponent(fetchJson.mock.calls[0][0] as string)).not.toContain(">");
  });
});
