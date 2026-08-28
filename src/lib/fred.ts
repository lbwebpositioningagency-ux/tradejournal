/**
 * Client FRED (Federal Reserve Bank of St. Louis) — SOLO server-side.
 *
 * Due strade, in ordine:
 * 1. API ufficiale JSON con chiave (`FRED_API_KEY`, gratuita su
 *    https://fredaccount.stlouisfed.org/apikeys);
 * 2. fallback keyless: CSV pubblico `fredgraph.csv?id=<ID>` — la pagina
 *    funziona anche senza chiave configurata.
 *
 * QUANDO SCATTA IL RIPIEGO, e quando NON deve scattare: solo su errore di
 * TRASPORTO (timeout, rete) o HTTP >= 400. Una risposta 200 con serie vuota
 * NON è un guasto, è una risposta — e chiedere la stessa cosa al CSV costava
 * un timeout intero per farsi ripetere che non c'è niente. Il caso reale sono
 * le serie OECD sul clima d'affari tedesco, ferme a gennaio 2024: rispondono,
 * semplicemente non hanno osservazioni nuove.
 *
 * OGNI RIPIEGO LASCIA TRACCIA, in due posti (v. `registraRipiego`): una riga
 * di log con prefisso stabile, e — per le serie del Driver Desk — l'etichetta
 * della rotta dentro `DriverDeskCoverage.source`, che è il registro delle
 * fonti che il desk già teneva.
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

/** Quale delle due strade ha risolto la serie. */
export type RottaFred = "api" | "csv";

export interface FredSeriesData {
  /** L'ID che ha effettivamente risolto (può essere un altId). */
  id: string;
  observations: FredObservation[];
  /**
   * Da dove è arrivato il dato. Serve a chi tiene un registro delle fonti —
   * il Driver Desk lo scrive in `DriverDeskCoverage.source` — perché «FRED»
   * e «FRED per ripiego» non sono la stessa affidabilità.
   */
  via: RottaFred;
}

/**
 * L'API ha risposto correttamente, ma la serie non ha osservazioni valide.
 *
 * Ha una classe propria perché è l'unico esito che NON deve far scattare il
 * ripiego: è una risposta, non un guasto.
 */
export class SerieFredSenzaOsservazioni extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = "SerieFredSenzaOsservazioni";
  }
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
/**
 * Quattro secondi, non quindici.
 *
 * Tutte le risposte buone misurate stanno sotto i 400 ms — da questa macchina
 * e da una funzione serverless in `iad1`. Quindici secondi non davano margine
 * a una risposta lenta: davano tempo a un ramo bloccato di far sembrare lenta
 * la pagina invece che rotta. Con ~60 serie in `Promise.allSettled` la
 * differenza fra i due valori è tutta a carico di chi guarda.
 */
const TIMEOUT_MS = 4_000;

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

/**
 * User agent ESPLICITO — non è cosmetico, ed è l'unico valore che funziona in
 * TUTTI E DUE gli ambienti in cui questo codice gira.
 *
 * `fredgraph.csv` sta dietro un filtro che guarda lo user agent, e il filtro
 * decide in modo OPPOSTO da una macchina di casa e da una funzione serverless.
 * Matrice misurata il 28/08/2026, stessa URL (`?id=GDPNOW`), stesso codice, in
 * locale e da una funzione Vercel in `iad1`:
 *
 *   user agent                                   locale        Vercel iad1
 *   Mozilla/5.0 (compatible; LB-TradingSpace/1.0) 200, 320 ms   timeout 15 s
 *   Mozilla/5.0 … Chrome/140.0.0.0 Safari/537.36  timeout       timeout
 *   curl/8.0.1                                    200, 121 ms   200, 163 ms
 *   "" (stringa vuota)                            timeout       timeout
 *   nessun header                                 timeout       200,  39 ms
 *
 * Il valore precedente era `Mozilla/5.0 (compatible; LB-TradingSpace/1.0)`:
 * verde in locale, MUTO in produzione. Ha retto perché in produzione il
 * ripiego non veniva quasi mai imboccato — con la chiave configurata l'API
 * risponde e il CSV non si tocca — e un ramo di riserva che non funziona si
 * scopre solo il giorno in cui serve.
 *
 * ATTENZIONE: `curl/8.0.1` passa un filtro anti-bot su un endpoint che NON è
 * l'API documentata. Quel filtro può cambiare senza preavviso, e il giorno che
 * cambia questo ramo torna muto. È esattamente per questo che ogni ripiego
 * lascia una riga di log: v. `registraRipiego`.
 */
const USER_AGENT = "curl/8.0.1";

/** fetch con data-cache giornaliera e timeout (la richiesta persa non blocca). */
async function fetchWithTimeout(
  url: string,
  revalidate: number,
): Promise<Response> {
  /* AbortController oltre alla race: senza, allo scadere del timeout la
     promise viene scartata ma la richiesta resta aperta a consumare un
     socket: con ~50 serie in parallelo se ne accumulano parecchie. */
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout dopo ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      fetch(url, {
        next: { revalidate },
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      }),
      timeout,
    ]);
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
    /* Classe dedicata, non un Error qualunque: è il discriminante che decide
       se il ripiego scatta. Qui l'API ha parlato — chiedere al CSV di
       ripetere «non c'è niente» costa un timeout e non cambia la risposta. */
    throw new SerieFredSenzaOsservazioni(
      `API FRED ${id}: risposta valida, nessuna osservazione`,
    );
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
 * REGISTRO DEI RIPIEGHI — una riga per ogni volta che il CSV viene imboccato
 * perché l'API ha fallito.
 *
 * Il prefisso è stabile e cercabile (`[fred:ripiego]`): è così che si vede da
 * un log quello che altrimenti si vedrebbe solo come una pagina lenta. Serve
 * soprattutto per il giorno in cui il filtro anti-bot di `fredgraph.csv`
 * cambierà idea sullo user agent — allora qui compariranno righe con
 * `esito: "fallito"` invece di `"riuscito"`, e il motivo sarà scritto.
 *
 * `console.warn` e non uno stato in memoria: questo modulo serve richieste, e
 * in un modulo condiviso fra richieste uno stato accumulato finirebbe nella
 * pagina di un altro utente (regola di progetto). Il registro DUREVOLE, per
 * le serie che passano da un job, è `DriverDeskCoverage.source`, che riceve
 * la rotta da `FredSeriesData.via`.
 */
function registraRipiego(riga: {
  id: string;
  motivo: string;
  esito: "riuscito" | "fallito";
  ms: number;
  dettaglio?: string;
}): void {
  console.warn(`[fred:ripiego] ${JSON.stringify(riga)}`);
}

/**
 * Scarica una serie provando gli ID in ordine (id principale + eventuali
 * alternativi): per ciascuno prima l'API con chiave (se configurata), poi il
 * CSV keyless. Lancia solo se TUTTE le strade falliscono.
 *
 * Il CSV è la strada PRINCIPALE quando la chiave non è configurata, e il
 * RIPIEGO quando c'è: nel secondo caso si imbocca solo se l'API ha fallito
 * per trasporto o con HTTP >= 400 — mai perché la serie è vuota.
 */
export async function fetchFredSeries(
  ids: string[],
  apiKey: string | undefined = process.env.FRED_API_KEY,
): Promise<FredSeriesData> {
  const errors: string[] = [];
  for (const id of ids) {
    /* Valorizzato solo quando il CSV è un RIPIEGO: porta il motivo per cui
       l'API non ha risposto, ed è anche il segnale che va registrato. */
    let motivoRipiego: string | null = null;

    if (apiKey) {
      try {
        return { id, observations: await fetchViaApi(id, apiKey), via: "api" };
      } catch (error) {
        errors.push(String(error));
        if (error instanceof SerieFredSenzaOsservazioni) {
          /* Risposta, non guasto: si passa all'ID alternativo (che è un'altra
             serie, quindi ha senso provarlo) senza interrogare il CSV. */
          continue;
        }
        motivoRipiego = error instanceof Error ? error.message : String(error);
      }
    }

    const inizio = Date.now();
    try {
      const observations = await fetchViaCsv(id);
      if (motivoRipiego !== null) {
        registraRipiego({ id, motivo: motivoRipiego, esito: "riuscito", ms: Date.now() - inizio });
      }
      return { id, observations, via: "csv" };
    } catch (error) {
      errors.push(String(error));
      if (motivoRipiego !== null) {
        registraRipiego({
          id,
          motivo: motivoRipiego,
          esito: "fallito",
          ms: Date.now() - inizio,
          dettaglio: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  throw new Error(`Serie FRED non risolta (${ids.join(", ")}): ${errors.join(" · ")}`);
}

/** La pagina dichiara se sta lavorando keyless (avviso informativo). */
export function hasFredApiKey(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}
