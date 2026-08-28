/**
 * Fonte Deutsche Bundesbank — SOLO server-side, API REST ufficiale keyless.
 *
 * Endpoint `api.statistiken.bundesbank.de/rest/data/<flow>/<key>?format=csv`:
 * gratuito, senza chiave, senza blocchi anti-bot. È INDIFFERENTE allo user
 * agent, e questo lo distingue da `fredgraph.csv`: misurato il 28/08/2026
 * sulla stessa URL, `curl/8.0.1` → HTTP 200 in 1,12 s e
 * `Mozilla/5.0 (compatible; LB-TradingSpace/1.0)` → HTTP 200 in 1,05 s, con
 * risposta identica (230.399 byte in entrambi i casi).
 *
 * La costante qui sotto NON è più la stessa del client FRED — lo era fino al
 * 28/08/2026, quando FRED è passato a `curl/8.0.1` perché era l'unico valore
 * che risponde sia in locale sia da una funzione serverless. Restano quindi
 * due user agent nel repo, e la differenza è deliberata: FRED sta dietro un
 * filtro che guarda l'intestazione, questo endpoint no.
 *
 * Serve UNA serie al
 * Driver Desk: il rendimento del Bund a 10 anni, giornaliero dal 1997 —
 * l'unica fonte gratuita e affidabile trovata per questo dato (FRED è
 * mensile, Yahoo non ha un ticker di rendimento tedesco).
 *
 * Formato: righe di metadati in testa, poi `YYYY-MM-DD,valore,flag`.
 * Il valore "." = osservazione MANCANTE (weekend e festivi): scartata, mai
 * uno zero — stessa disciplina del client FRED.
 *
 * Il parser è una funzione pura esportata: si testa senza rete.
 */

export interface BundesbankObservation {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
}

const BASE =
  process.env.BUNDESBANK_REST_BASE_URL ??
  "https://api.statistiken.bundesbank.de/rest/data";
const TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; LB-TradingSpace/1.0)";

const ROW_RE = /^(\d{4}-\d{2}-\d{2}),([^,]*)(?:,|$)/;

/** Parser del CSV Bundesbank: tiene solo le righe-dato con valore numerico. */
export function parseBundesbankCsv(text: string): BundesbankObservation[] {
  const out: BundesbankObservation[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ROW_RE.exec(line.trim());
    if (!m) continue;
    const raw = m[2].trim();
    if (raw === "" || raw === ".") continue; // mancante, MAI zero
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date: m[1], value });
  }
  return out;
}

export async function fetchBundesbankSeries(
  flow: string,
  key: string,
): Promise<BundesbankObservation[]> {
  const url = `${BASE}/${encodeURIComponent(flow)}/${encodeURIComponent(key)}?format=csv&lang=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/csv" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Bundesbank ${flow}/${key}: HTTP ${res.status}`);
    const observations = parseBundesbankCsv(await res.text());
    if (observations.length === 0) {
      throw new Error(`Bundesbank ${flow}/${key}: nessuna osservazione valida`);
    }
    return observations;
  } finally {
    clearTimeout(timer);
  }
}
