/**
 * Sync settimanale COT — logica del job, separata dall'infrastruttura.
 *
 * Il job scarica dall'API pubblica CFTC (Socrata, nessuna chiave) le settimane
 * successive all'ultima già salvata in tabella `CotWeek` e le APPENDE: mai
 * sovrascrivere settimane esistenti (vincolo unique + skipDuplicates + filtro
 * client-side, tre livelli di difesa).
 *
 * IDENTIFICAZIONE PER CODICE, non per nome: il CFTC ha già rinominato il WTI a
 * inizio 2022 ("CRUDE OIL, LIGHT SWEET" → "WTI-PHYSICAL") e il nome è quindi
 * una chiave che si muove sotto i piedi; `cftc_contract_market_code` no. Le
 * misure che lo dimostrano stanno accanto a `CONTRATTI_COT`.
 *
 * GUARDIA che resta: se il codice non restituisce più nulla, il job NON lancia:
 * tiene l'ultimo dato buono, risponde con "contratto_non_trovato" e dichiara da
 * quanti giorni il dato è fermo. Idem per gli errori di rete. L'esito
 * complessivo `ok: false` + `console.error` rendono il problema visibile nei
 * log del cron — mai errore silenzioso, mai crash.
 *
 * Le dipendenze (db, fetch, orologio) sono iniettate: i test girano con fake,
 * senza rete e senza Postgres. L'adapter Prisma reale è in fondo al file.
 */

import type { PrismaClient } from "@/generated/prisma/client";

export type CodiceStrumentoCot = "GOLD" | "WTI";

/**
 * Contratti COT, identificati per **codice di mercato CFTC**, non per nome.
 *
 * ── PERCHÉ IL CODICE E NON IL NOME ───────────────────────────────────────
 *
 * Il nome cambia, il codice no — e nel dataset i due nomi convivono sulla
 * stessa serie. Misurato il 28/08/2026 interrogando il dataset stesso:
 *
 *   $select=distinct market_and_exchange_names, cftc_contract_market_code
 *   $where=market_and_exchange_names like '%CRUDE%' or ... like '%WTI%'
 *
 * restituisce il codice `067651` sotto DUE nomi diversi —
 * "CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE" (il nome storico) e
 * "WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE" (quello attuale) — con lo
 * stesso open interest, 1.888.960 al 18/08/2026.
 *
 * E il conteggio dice quanto costava filtrare per nome:
 *
 *   $select=count(*) $where=cftc_contract_market_code = '067651'   → 1054
 *   $select=count(*) $where=market_and_exchange_names = 'WTI-PHY…' →  237
 *
 * **817 settimane su 1054 erano invisibili alla query per nome.** Non si
 * vedeva perché il job APPENDE solo le settimane successive all'ultima
 * salvata e la storia arriva dal CSV di seed: il buco stava nella sonda e in
 * qualunque ricostruzione da zero, non nel dato di ieri.
 *
 * Sull'oro i due conteggi coincidono (1054 = 1054): nessuna rinomina, nessuna
 * perdita. Il codice è comunque la chiave giusta, perché regge la prossima.
 *
 * I codici NON sono stati presi a memoria: sono quelli restituiti dal dataset
 * per i due contratti con l'open interest maggiore fra gli omonimi —
 * `088691` (406.260 contro i 63.633 del micro e gli 8.468 del contratto
 * Coinbase) e `067651` (1.888.960 contro gli 815.351 della gemella ICE).
 */
export interface ContrattoCot {
  /** `cftc_contract_market_code`: l'unica chiave su cui si filtra. */
  codice: string;
  /** Nome corrente. Serve agli esiti e ai log: non entra mai nella query. */
  nome: string;
}

export const CONTRATTI_COT: Record<CodiceStrumentoCot, ContrattoCot> = {
  GOLD: { codice: "088691", nome: "GOLD - COMMODITY EXCHANGE INC." },
  WTI: { codice: "067651", nome: "WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE" },
};

export const STRUMENTI_COT = Object.keys(CONTRATTI_COT) as CodiceStrumentoCot[];

/**
 * Oltre questa anzianità dell'ultimo dato il job segnala "non aggiornato da
 * N giorni". A regime il martedì salvato invecchia fino a ~10 giorni prima
 * della pubblicazione successiva (11-13 con le festività che spostano
 * l'uscita al lunedì): 14 evita falsi allarmi.
 */
export const SOGLIA_RITARDO_GIORNI = 14;

/** Una settimana COT normalizzata: data ISO del martedì + contratti interi. */
export interface SettimanaCot {
  reportDate: string; // "YYYY-MM-DD"
  openInterest: number;
  mmNet: number;
  prodNet: number;
}

export interface EsitoStrumento {
  strumento: CodiceStrumentoCot;
  contratto: string;
  esito: "aggiornato" | "gia_aggiornato" | "contratto_non_trovato" | "errore_rete";
  inserite: number;
  /** Ultima settimana in tabella DOPO il sync (null = tabella vuota). */
  ultimaSettimana: string | null;
  giorniDaUltimaSettimana: number | null;
  /** Valorizzato solo oltre soglia: "non aggiornato da N giorni". */
  nonAggiornatoDaGiorni: number | null;
  dettaglio?: string;
}

export interface EsitoSync {
  eseguitoIl: string;
  /** false se anche un solo strumento è in errore, senza contratto o stantio. */
  ok: boolean;
  strumenti: EsitoStrumento[];
}

/* ── costruzione URL e parsing della risposta Socrata ───────────────── */

const BASE_CFTC = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";

const CAMPI = [
  "report_date_as_yyyy_mm_dd",
  "open_interest_all",
  "m_money_positions_long_all",
  "m_money_positions_short_all",
  "prod_merc_positions_long",
  "prod_merc_positions_short",
].join(",");

/**
 * URL Socrata per un contratto, opzionalmente solo le settimane dopo `dopo`.
 * Il filtro è sul CODICE di mercato (v. `CONTRATTI_COT`). L'apice va comunque
 * raddoppiato (sintassi SoQL): i codici non ne contengono, ma un codice
 * sbagliato non deve poter rompere la query invece di non trovare nulla.
 */
export function urlCftc(codiceMercato: string, dopo?: string | null): string {
  const codice = codiceMercato.replace(/'/g, "''");
  let where = `cftc_contract_market_code = '${codice}'`;
  if (dopo) {
    where += ` AND report_date_as_yyyy_mm_dd > '${dopo}T00:00:00.000'`;
  }
  // encodeURIComponent, non URLSearchParams: quest'ultimo codifica gli spazi
  // come "+", che dentro $where Socrata non interpreta come spazio.
  const query = [
    `$select=${encodeURIComponent(CAMPI)}`,
    `$where=${encodeURIComponent(where)}`,
    `$order=${encodeURIComponent("report_date_as_yyyy_mm_dd ASC")}`,
    "$limit=1000",
  ].join("&");
  return `${BASE_CFTC}?${query}`;
}

function interoDaSocrata(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Righe Socrata → settimane normalizzate. I numeri arrivano come stringhe
 * ("1864487"), la data come floating timestamp ("2026-07-21T00:00:00.000").
 * Le righe malformate vengono scartate una a una: una riga rotta non deve
 * buttare via le altre.
 */
export function parseRigheCftc(body: unknown): SettimanaCot[] {
  if (!Array.isArray(body)) return [];
  const fuori: SettimanaCot[] = [];
  for (const riga of body) {
    if (typeof riga !== "object" || riga === null) continue;
    const r = riga as Record<string, unknown>;
    const dataGrezza = r.report_date_as_yyyy_mm_dd;
    if (typeof dataGrezza !== "string") continue;
    const reportDate = dataGrezza.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) continue;

    const oi = interoDaSocrata(r.open_interest_all);
    const mmLong = interoDaSocrata(r.m_money_positions_long_all);
    const mmShort = interoDaSocrata(r.m_money_positions_short_all);
    const prodLong = interoDaSocrata(r.prod_merc_positions_long);
    const prodShort = interoDaSocrata(r.prod_merc_positions_short);
    if (oi === null || mmLong === null || mmShort === null || prodLong === null || prodShort === null) {
      continue;
    }
    fuori.push({
      reportDate,
      openInterest: oi,
      mmNet: mmLong - mmShort,
      prodNet: prodLong - prodShort,
    });
  }
  return fuori;
}

/* ── CSV storico (dati/COT_gold_wti.csv) per il seed ────────────────── */

const HEADER_CSV = "time,strumento,open_interest,mm_net,prod_net";

/**
 * Parser STRETTO del CSV storico: qui una riga malformata è un errore da
 * fermare subito (si sta popolando la base storica, non ascoltando un'API),
 * quindi si lancia invece di scartare in silenzio.
 */
export function parseCsvStoricoCot(
  testo: string,
): Array<{ strumento: CodiceStrumentoCot; settimana: SettimanaCot }> {
  const righe = testo.split(/\r?\n/).filter((r) => r.trim() !== "");
  if (righe[0]?.trim() !== HEADER_CSV) {
    throw new Error(`Header CSV inatteso: "${righe[0]}" (atteso "${HEADER_CSV}")`);
  }
  const fuori: Array<{ strumento: CodiceStrumentoCot; settimana: SettimanaCot }> = [];
  for (let i = 1; i < righe.length; i += 1) {
    const campi = righe[i].split(",");
    if (campi.length !== 5) throw new Error(`Riga ${i + 1}: attesi 5 campi, trovati ${campi.length}`);
    const [data, strumento, oi, mmNet, prodNet] = campi.map((c) => c.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`Riga ${i + 1}: data non valida "${data}"`);
    if (strumento !== "GOLD" && strumento !== "WTI") {
      throw new Error(`Riga ${i + 1}: strumento sconosciuto "${strumento}"`);
    }
    const numeri = [oi, mmNet, prodNet].map((v) => Number(v));
    if (numeri.some((n) => !Number.isFinite(n) || !Number.isInteger(n))) {
      throw new Error(`Riga ${i + 1}: valori non interi (${oi}, ${mmNet}, ${prodNet})`);
    }
    fuori.push({
      strumento,
      settimana: {
        reportDate: data,
        openInterest: numeri[0],
        mmNet: numeri[1],
        prodNet: numeri[2],
      },
    });
  }
  return fuori;
}

/* ── il job ─────────────────────────────────────────────────────────── */

/** Client minimo richiesto dal job: consente fake nei test e prisma reale. */
export interface CotSyncDb {
  /** Data ISO ("YYYY-MM-DD") dell'ultima settimana salvata, o null. */
  ultimaSettimana(strumento: CodiceStrumentoCot): Promise<string | null>;
  /** Append-only (skipDuplicates): restituisce quante righe sono state inserite davvero. */
  inserisciSettimane(strumento: CodiceStrumentoCot, settimane: SettimanaCot[]): Promise<number>;
}

export type FetchJson = (url: string) => Promise<unknown>;

async function fetchJsonReale(url: string): Promise<unknown> {
  const risposta = await fetch(url, { headers: { accept: "application/json" } });
  if (!risposta.ok) {
    throw new Error(`CFTC ha risposto ${risposta.status}`);
  }
  return risposta.json();
}

function giorniFra(dataIso: string, oggi: Date): number {
  const t = Date.parse(`${dataIso}T00:00:00Z`);
  return Math.floor((oggi.getTime() - t) / 86_400_000);
}

async function sincronizzaStrumento(
  strumento: CodiceStrumentoCot,
  db: CotSyncDb,
  fetchJson: FetchJson,
  oggi: Date,
): Promise<EsitoStrumento> {
  const contratto = CONTRATTI_COT[strumento];
  const base: Pick<EsitoStrumento, "strumento" | "contratto"> = {
    strumento,
    contratto: `${contratto.nome} (${contratto.codice})`,
  };
  const ultimaPrima = await db.ultimaSettimana(strumento);

  const conAnzianita = (
    parziale: Omit<EsitoStrumento, "ultimaSettimana" | "giorniDaUltimaSettimana" | "nonAggiornatoDaGiorni">,
    ultima: string | null,
  ): EsitoStrumento => {
    const giorni = ultima === null ? null : giorniFra(ultima, oggi);
    return {
      ...parziale,
      ultimaSettimana: ultima,
      giorniDaUltimaSettimana: giorni,
      nonAggiornatoDaGiorni: giorni !== null && giorni > SOGLIA_RITARDO_GIORNI ? giorni : null,
    };
  };

  try {
    const corpo = await fetchJson(urlCftc(contratto.codice, ultimaPrima));
    // Difesa client-side oltre al filtro dell'API: mai righe ≤ ultima salvata.
    const nuove = parseRigheCftc(corpo).filter(
      (r) => ultimaPrima === null || r.reportDate > ultimaPrima,
    );

    if (nuove.length > 0) {
      const inserite = await db.inserisciSettimane(strumento, nuove);
      const ultima = nuove[nuove.length - 1].reportDate;
      return conAnzianita({ ...base, esito: "aggiornato", inserite }, ultima);
    }

    // Zero righe nuove: normale subito dopo una settimana già presa, oppure
    // il contratto è sparito dal dataset. Si distingue con una sonda SENZA
    // filtro data: se il codice non restituisce nulla in assoluto, non è più
    // in `72hh-3qpy`.
    //
    // Da quando si filtra per CODICE questo esito ha smesso di scattare per
    // le rinomine — che erano la causa storica (WTI, 2022) — e resta per il
    // caso più raro e più grave: contratto ritirato o ricodificato dalla
    // CFTC, oppure uscito dal report disaggregato.
    const sonda = parseRigheCftc(await fetchJson(urlCftc(contratto.codice, null)));
    if (sonda.length === 0) {
      return conAnzianita(
        {
          ...base,
          esito: "contratto_non_trovato",
          inserite: 0,
          dettaglio:
            `Il codice di mercato ${contratto.codice} non restituisce più nulla da 72hh-3qpy: contratto ritirato, ricodificato, o uscito dal report disaggregato. Ricavare il nuovo codice con "$select=distinct market_and_exchange_names, cftc_contract_market_code" e aggiornare CONTRATTI_COT.`,
        },
        ultimaPrima,
      );
    }
    return conAnzianita({ ...base, esito: "gia_aggiornato", inserite: 0 }, ultimaPrima);
  } catch (errore) {
    return conAnzianita(
      {
        ...base,
        esito: "errore_rete",
        inserite: 0,
        dettaglio: errore instanceof Error ? errore.message : String(errore),
      },
      ultimaPrima,
    );
  }
}

/**
 * Esegue il sync per tutti gli strumenti. Non lancia MAI: ogni problema è un
 * esito dichiarato, e `ok: false` + console.error lo rendono visibile nei log.
 */
export async function runCotSync(
  db: CotSyncDb,
  fetchJson: FetchJson = fetchJsonReale,
  oggi: Date = new Date(),
): Promise<EsitoSync> {
  const strumenti: EsitoStrumento[] = [];
  for (const strumento of STRUMENTI_COT) {
    strumenti.push(await sincronizzaStrumento(strumento, db, fetchJson, oggi));
  }

  const ok = strumenti.every(
    (s) =>
      (s.esito === "aggiornato" || s.esito === "gia_aggiornato") &&
      s.nonAggiornatoDaGiorni === null,
  );
  if (!ok) {
    for (const s of strumenti) {
      if (s.esito === "errore_rete" || s.esito === "contratto_non_trovato") {
        console.error(`[cot-sync] ${s.strumento}: ${s.esito} — ${s.dettaglio ?? ""}`);
      } else if (s.nonAggiornatoDaGiorni !== null) {
        console.error(`[cot-sync] ${s.strumento}: non aggiornato da ${s.nonAggiornatoDaGiorni} giorni`);
      }
    }
  }
  return { eseguitoIl: oggi.toISOString(), ok, strumenti };
}

/* ── adapter Prisma reale ───────────────────────────────────────────── */

type CotWeekClient = Pick<PrismaClient, "cotWeek">;

/** Implementazione su Postgres. Volutamente sottile: la logica sta sopra,
 * qui solo la traduzione da/verso Prisma (Date a mezzanotte UTC ↔ ISO). */
export function cotSyncDbPrisma(client: CotWeekClient): CotSyncDb {
  return {
    async ultimaSettimana(strumento) {
      const riga = await client.cotWeek.findFirst({
        where: { instrument: strumento },
        orderBy: { reportDate: "desc" },
        select: { reportDate: true },
      });
      return riga ? riga.reportDate.toISOString().slice(0, 10) : null;
    },
    async inserisciSettimane(strumento, settimane) {
      const esito = await client.cotWeek.createMany({
        data: settimane.map((s) => ({
          instrument: strumento,
          reportDate: new Date(`${s.reportDate}T00:00:00Z`),
          openInterest: s.openInterest,
          mmNet: s.mmNet,
          prodNet: s.prodNet,
        })),
        skipDuplicates: true,
      });
      return esito.count;
    },
  };
}
