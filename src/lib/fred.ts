/**
 * Client FRED (Federal Reserve Bank of St. Louis) — SOLO server-side.
 *
 * Due strade, in ordine:
 * 1. API ufficiale JSON con chiave (`FRED_API_KEY`, gratuita su
 *    https://fredaccount.stlouisfed.org/apikeys);
 * 2. fallback keyless: CSV pubblico `fredgraph.csv?id=<ID>` — la pagina
 *    funziona anche senza chiave configurata.
 *
 * Disciplina dati:
 * - il valore "." di FRED = osservazione MANCANTE: scartata, mai uno zero;
 * - cache giornaliera via Next data cache (`next.revalidate` ~86400, con
 *   scadenza scaglionata per serie — vedi `revalidateSecondsFor`): i dati
 *   macro non cambiano intraday e non martelliamo FRED;
 * - timeout esplicito: una serie lenta non blocca la pagina (il chiamante
 *   usa Promise.allSettled e mostra la card in errore).
 *
 * I parser sono funzioni pure esportate: si testano senza rete.
 */

export interface FredObservation {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
}

export interface FredSeriesData {
  /** L'ID che ha effettivamente risolto (può essere un altId). */
  id: string;
  observations: FredObservation[];
}

/* Base URL sovrascrivibili via env: servono per test locali e per reti
   aziendali che passano da un proxy — in produzione restano gli endpoint
   ufficiali (variabili non impostate). */
const API_BASE =
  process.env.FRED_API_BASE_URL ??
  "https://api.stlouisfed.org/fred/series/observations";
const CSV_BASE =
  process.env.FRED_CSV_BASE_URL ??
  "https://fred.stlouisfed.org/graph/fredgraph.csv";
const REVALIDATE_SECONDS = 86_400;
const TIMEOUT_MS = 15_000;

/**
 * P-05 — scadenze SCAGLIONATE per serie: con `revalidate` identico per
 * tutte, la data cache delle ~50 serie scade in blocco e il primo
 * visitatore del giorno paga tutti i refetch insieme. Un jitter di ±3 h
 * attorno alle 24 h, DETERMINISTICO sull'ID (stesso valore a ogni build e
 * istanza: la chiave di cache resta stabile), distribuisce le scadenze
 * nell'arco di 6 ore senza cambiare la cadenza giornaliera.
 */
const REVALIDATE_JITTER_SECONDS = 10_800;

export function revalidateSecondsFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const offset =
    (hash % (2 * REVALIDATE_JITTER_SECONDS + 1)) - REVALIDATE_JITTER_SECONDS;
  return REVALIDATE_SECONDS + offset;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toObservation(date: unknown, raw: unknown): FredObservation | null {
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "");
  if (text === "" || text === ".") return null; // mancante, MAI zero
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return { date, value };
}

/** Parser della risposta JSON dell'API (`observations[].{date,value}`). */
export function parseFredJson(payload: unknown): FredObservation[] {
  if (payload === null || typeof payload !== "object") return [];
  const observations = (payload as { observations?: unknown }).observations;
  if (!Array.isArray(observations)) return [];
  const out: FredObservation[] = [];
  for (const row of observations) {
    if (row === null || typeof row !== "object") continue;
    const { date, value } = row as { date?: unknown; value?: unknown };
    const obs = toObservation(date, value);
    if (obs) out.push(obs);
  }
  return out;
}

/**
 * Parser del CSV keyless (`DATE,<ID>` oppure `observation_date,<ID>`):
 * prima riga = intestazione (ignorata), una riga = un'osservazione.
 */
export function parseFredCsv(text: string): FredObservation[] {
  const out: FredObservation[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "") continue;
    const comma = line.indexOf(",");
    if (comma === -1) continue;
    const obs = toObservation(line.slice(0, comma), line.slice(comma + 1));
    if (obs) out.push(obs);
  }
  return out;
}

/** fetch con data-cache giornaliera e timeout (la richiesta persa non blocca). */
async function fetchWithTimeout(
  url: string,
  revalidate: number,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timeout dopo ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([fetch(url, { next: { revalidate } }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaApi(
  id: string,
  apiKey: string,
): Promise<FredObservation[]> {
  const url = `${API_BASE}?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(apiKey)}&file_type=json`;
  const res = await fetchWithTimeout(url, revalidateSecondsFor(id));
  if (!res.ok) throw new Error(`API FRED ${id}: HTTP ${res.status}`);
  const payload: unknown = await res.json();
  const observations = parseFredJson(payload);
  if (observations.length === 0) {
    throw new Error(`API FRED ${id}: nessuna osservazione valida`);
  }
  return observations;
}

async function fetchViaCsv(id: string): Promise<FredObservation[]> {
  const url = `${CSV_BASE}?id=${encodeURIComponent(id)}`;
  const res = await fetchWithTimeout(url, revalidateSecondsFor(id));
  if (!res.ok) throw new Error(`CSV FRED ${id}: HTTP ${res.status}`);
  const observations = parseFredCsv(await res.text());
  if (observations.length === 0) {
    throw new Error(`CSV FRED ${id}: nessuna osservazione valida`);
  }
  return observations;
}

/**
 * Scarica una serie provando gli ID in ordine (id principale + eventuali
 * alternativi): per ciascuno prima l'API con chiave (se configurata), poi il
 * CSV keyless. Lancia solo se TUTTE le strade falliscono.
 */
export async function fetchFredSeries(
  ids: string[],
  apiKey: string | undefined = process.env.FRED_API_KEY,
): Promise<FredSeriesData> {
  const errors: string[] = [];
  for (const id of ids) {
    if (apiKey) {
      try {
        return { id, observations: await fetchViaApi(id, apiKey) };
      } catch (error) {
        errors.push(String(error));
      }
    }
    try {
      return { id, observations: await fetchViaCsv(id) };
    } catch (error) {
      errors.push(String(error));
    }
  }
  throw new Error(`Serie FRED non risolta (${ids.join(", ")}): ${errors.join(" · ")}`);
}

/** La pagina dichiara se sta lavorando keyless (avviso informativo). */
export function hasFredApiKey(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}
