/**
 * Fonte Yahoo Finance — SOLO server-side.
 *
 * Endpoint `query1.finance.yahoo.com/v8/finance/chart/<simbolo>`: keyless ma
 * NON è un'API pubblicata. Può cambiare o chiudere senza preavviso, e per
 * questo non è mai l'unica fonte di uno strumento: sta dentro una catena di
 * fallback e la sorgente che ha davvero risposto viene registrata.
 *
 * Il parser è una funzione pura esportata: si testa senza rete.
 */

import type { DailyBar } from "@/lib/seasonality/series";

const BASE =
  process.env.YAHOO_CHART_BASE_URL ??
  "https://query1.finance.yahoo.com/v8/finance/chart";
const TIMEOUT_MS = 30_000;

/**
 * Converte un timestamp Unix (secondi) nella data civile UTC "YYYY-MM-DD".
 *
 * Yahoo marca ogni barra giornaliera con l'istante di APERTURA della borsa,
 * che in UTC cade sempre nello stesso giorno civile della seduta per tutti i
 * mercati che ci interessano (Francoforte ~07:00-08:00 UTC, New York
 * ~14:30 UTC). Usare la data UTC è quindi corretto e — a differenza della
 * data locale della macchina — dà lo stesso risultato ovunque giri il job.
 */
export function utcDateKey(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Chiusura dell'ULTIMA barra recuperata dai metadati, quando Yahoo non l'ha
 * ancora consolidata nell'array `quote.close`.
 *
 * Il caso, misurato il 29/08/2026 alle 08:10 UTC — cioè sedici ore dopo la
 * chiusura di venerdì — su cinque simboli su cinque (^GDAXI, ^STOXX50E,
 * ^FCHI, ^GSPC, DX-Y.NYB): l'ultima barra arriva con `open` valorizzato,
 * `volume` a zero e `close` NULLO, mentre `meta.regularMarketPrice` porta già
 * la chiusura vera. Non è una sospensione — è una barra ancora aperta in
 * scrittura. Il consolidamento arriva entro ~24 ore, e questo è il motivo per
 * cui tutte le serie Yahoo del desk erano indietro di una seduta.
 *
 * Riscontro indipendente sulle chiusure del 28/08/2026: DAX 26.569,99 contro
 * i 26.551,69 del CFD Dukascopy (scarto 0,069%), S&P 500 7.711,76 contro
 * 7.708,54 (0,042%) — scarti da CFD-contro-cash, il livello è quello giusto.
 *
 * TRE GUARDIE, tutte necessarie. La più importante è la terza: durante una
 * seduta APERTA `regularMarketPrice` è il prezzo VIVO, e scriverlo come
 * chiusura sarebbe falsificare il dato. Se una qualsiasi non è verificabile
 * si rinuncia — la barra resta scartata come prima, e il consolidamento la
 * recupererà la notte dopo dentro la finestra delta.
 */
function chiusuraDaMeta(
  meta: unknown,
  ts: number,
  now: Date,
): number | undefined {
  if (meta === null || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;

  // 1. il prezzo esiste ed è un livello plausibile
  const price = m.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  // 2. il prezzo appartiene alla GIORNATA della barra, non a un'altra
  const marketTime = m.regularMarketTime;
  if (typeof marketTime !== "number" || !Number.isFinite(marketTime)) {
    return undefined;
  }
  if (utcDateKey(marketTime) !== utcDateKey(ts)) return undefined;

  // 3. la seduta è FINITA: altrimenti quello è un prezzo vivo, non una chiusura
  const periodo = m.currentTradingPeriod;
  if (periodo === null || typeof periodo !== "object") return undefined;
  const regular = (periodo as Record<string, unknown>).regular;
  if (regular === null || typeof regular !== "object") return undefined;
  const end = (regular as Record<string, unknown>).end;
  if (typeof end !== "number" || !Number.isFinite(end)) return undefined;
  if (now.getTime() < end * 1000) return undefined;

  return price;
}

/**
 * Parser della risposta chart. Scarta le barre con chiusura `null` — Yahoo le
 * usa per i giorni di sospensione — che sono osservazioni MANCANTI, mai zeri.
 *
 * UNICA eccezione, e solo per l'ULTIMA barra: v. `chiusuraDaMeta`. `now` è
 * iniettabile perché la terza guardia dipende dall'orologio e un test non può
 * dipendere da quando lo si esegue.
 */
export function parseYahooChart(
  payload: unknown,
  now: Date = new Date(),
): DailyBar[] {
  if (payload === null || typeof payload !== "object") return [];
  const chart = (payload as { chart?: unknown }).chart;
  if (chart === null || typeof chart !== "object") return [];
  const results = (chart as { result?: unknown }).result;
  if (!Array.isArray(results) || results.length === 0) return [];
  const first = results[0];
  if (first === null || typeof first !== "object") return [];

  const timestamps = (first as { timestamp?: unknown }).timestamp;
  if (!Array.isArray(timestamps)) return [];

  const indicators = (first as { indicators?: unknown }).indicators;
  if (indicators === null || typeof indicators !== "object") return [];
  const quotes = (indicators as { quote?: unknown }).quote;
  if (!Array.isArray(quotes) || quotes.length === 0) return [];
  const quote = quotes[0] as Record<string, unknown> | undefined;
  const closes = quote?.close;
  if (!Array.isArray(closes)) return [];

  /* Le altre tre facce sono FACOLTATIVE: se Yahoo cambia forma e smette di
     mandarle, si torna alla sola chiusura invece di far cadere la serie. Chi
     deve accorgersene è la verifica di esito del job, non il parser. */
  const serie = (nome: string): unknown[] | null => {
    const v = quote?.[nome];
    return Array.isArray(v) ? v : null;
  };
  const opens = serie("open");
  const highs = serie("high");
  const lows = serie("low");
  const num = (a: unknown[] | null, i: number): number | undefined => {
    const v = a?.[i];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
  };

  const meta = (first as { meta?: unknown }).meta;
  const ultima = timestamps.length - 1;

  const out: DailyBar[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const ts = timestamps[i];
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    const grezza = closes[i];
    let close =
      typeof grezza === "number" && Number.isFinite(grezza) && grezza > 0
        ? grezza
        : undefined;
    /* Il ripescaggio vale SOLO per l'ultima barra: è l'unica che Yahoo possa
       avere ancora aperta in scrittura. Un buco in mezzo alla serie è una
       sospensione vera e resta un dato mancante. */
    if (close === undefined && i === ultima) {
      close = chiusuraDaMeta(meta, ts, now);
    }
    if (close === undefined) continue;
    out.push({
      date: utcDateKey(ts),
      close,
      open: num(opens, i),
      high: num(highs, i),
      low: num(lows, i),
    });
  }
  return out;
}

/**
 * Granularità DICHIARATA da Yahoo nella risposta (`meta.dataGranularity`).
 *
 * Controllo tutt'altro che pedante: con `range=max&interval=1d` Yahoo ignora
 * l'intervallo richiesto e restituisce dati TRIMESTRALI, dichiarandolo solo
 * qui. Misurato il 03/08/2026 su ^GSPC: 168 barre "giornaliere" su 42 anni,
 * granularità reale `3mo`. Senza questo controllo il modulo avrebbe calcolato
 * stagionalità mensili e per giorno della settimana su barre trimestrali —
 * numeri plausibili, ordinati, e completamente falsi.
 */
export function parseYahooGranularity(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const chart = (payload as { chart?: unknown }).chart;
  if (chart === null || typeof chart !== "object") return null;
  const results = (chart as { result?: unknown }).result;
  if (!Array.isArray(results) || results.length === 0) return null;
  const meta = (results[0] as { meta?: unknown })?.meta;
  if (meta === null || typeof meta !== "object") return null;
  const g = (meta as { dataGranularity?: unknown }).dataGranularity;
  return typeof g === "string" ? g : null;
}

/** Messaggio d'errore di Yahoo, se la risposta ne porta uno. */
export function parseYahooError(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const chart = (payload as { chart?: unknown }).chart;
  if (chart === null || typeof chart !== "object") return null;
  const error = (chart as { error?: unknown }).error;
  if (error === null || typeof error !== "object") return null;
  const description = (error as { description?: unknown }).description;
  return typeof description === "string" ? description : "errore Yahoo";
}

export async function fetchYahooDaily(
  symbol: string,
  now: Date = new Date(),
): Promise<DailyBar[]> {
  /* period1/period2 e NON range=max: con `range=max` Yahoo declassa
     silenziosamente l'intervallo a trimestrale (vedi parseYahooGranularity).
     Con gli estremi espliciti restituisce il giornaliero vero, a partire dal
     1970 — il limite dell'endpoint, comunque molto oltre i 20 anni che
     servono. */
  const period2 = Math.floor(now.getTime() / 1000);
  const url =
    `${BASE}/${encodeURIComponent(symbol)}` +
    `?period1=0&period2=${period2}&interval=1d`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // L'endpoint rifiuta le richieste senza user agent riconoscibile.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LB-TradingSpace/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
    const payload: unknown = await res.json();

    const granularity = parseYahooGranularity(payload);
    if (granularity !== null && granularity !== "1d") {
      throw new Error(
        `Yahoo ${symbol}: la risposta è a granularità "${granularity}", non giornaliera — serie rifiutata`,
      );
    }

    const bars = parseYahooChart(payload, now);
    if (bars.length === 0) {
      const err = parseYahooError(payload);
      throw new Error(
        `Yahoo ${symbol}: nessuna barra valida${err ? ` (${err})` : ""}`,
      );
    }
    return bars;
  } finally {
    clearTimeout(timer);
  }
}
