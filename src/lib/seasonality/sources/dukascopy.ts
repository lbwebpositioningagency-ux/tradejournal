/**
 * Fonte Dukascopy — SOLO server-side, server pubblici keyless.
 *
 * `dukascopy-node` è importato in modo DINAMICO e il pacchetto è dichiarato
 * in `serverExternalPackages` (next.config.ts): è una libreria Node con
 * dipendenze binarie e accesso al filesystem, che il bundler di Next non deve
 * provare a impacchettare dentro la route.
 *
 * I timestamp restituiti sono in UTC e restano in UTC: la conversione a ora
 * italiana avviene solo in fase di bucketing, mai sul dato salvato.
 */

import type { DailyBar } from "@/lib/seasonality/series";
import type { QuarterBar } from "@/lib/seasonality/quarter";

/**
 * Candele GIORNALIERE. `priceType: "bid"` per coerenza con l'intraday: quale
 * lato si prende conta pochissimo su un rendimento (lo spread si semplifica
 * quasi del tutto), ma prenderne uno solo e sempre lo stesso evita che un
 * cambio di lato introduca un salto artificiale nella serie.
 */
export async function fetchDukascopyDaily(
  symbol: string,
  from: Date,
  to: Date,
): Promise<DailyBar[]> {
  const { getHistoricRates } = await import("dukascopy-node");
  const rates = await getHistoricRates({
    instrument: symbol as Parameters<typeof getHistoricRates>[0]["instrument"],
    dates: { from, to },
    timeframe: "d1",
    priceType: "bid",
    format: "json",
    useCache: false,
  });

  const out: DailyBar[] = [];
  for (const bar of rates) {
    const close = bar.close;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    /* Dukascopy restituisce la candela intera. Fino al 26/08/2026 qui si
       teneva la sola chiusura, ed è la ragione per cui il desk misurava le
       giornate chiusura-contro-chiusura pur avendo high e low sotto mano.
       La plausibilità dell'OHLC la verifica `normalizeBars`. */
    out.push({
      date: new Date(bar.timestamp).toISOString().slice(0, 10),
      close,
      open: bar.open,
      high: bar.high,
      low: bar.low,
    });
  }
  if (out.length === 0) {
    throw new Error(`Dukascopy ${symbol}: nessuna barra giornaliera`);
  }
  return out;
}

export interface HourBar {
  /** Inizio dell'ora, in UTC. */
  ts: Date;
  close: number;
}

/**
 * Candele ORARIE (timeframe H1) scaricate DIRETTAMENTE, non ricostruite dai
 * tick: per i bucket per ora e per sessione servono le ore, e il file orario
 * mensile di Dukascopy pesa una frazione infinitesima dei tick dello stesso
 * periodo. Ricostruirle dai tick vorrebbe dire scaricare gigabyte per
 * ottenere lo stesso identico risultato.
 *
 * La finestra viene spezzata in blocchi ANNUALI dal chiamante: un blocco che
 * fallisce non porta con sé i vent'anni già scaricati, e l'avanzamento è
 * visibile durante un backfill che dura minuti.
 */
export async function fetchDukascopyHourly(
  symbol: string,
  from: Date,
  to: Date,
): Promise<HourBar[]> {
  const { getHistoricRates } = await import("dukascopy-node");
  const rates = await getHistoricRates({
    instrument: symbol as Parameters<typeof getHistoricRates>[0]["instrument"],
    dates: { from, to },
    timeframe: "h1",
    priceType: "bid",
    format: "json",
    useCache: false,
  });

  const out: HourBar[] = [];
  for (const bar of rates) {
    const close = bar.close;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    out.push({ ts: new Date(bar.timestamp), close });
  }
  return out;
}

/**
 * Candele a 15 MINUTI (timeframe M15) — alimentano il solo grafico del
 * ritorno intraday, che disegna 96 punti invece di 24.
 *
 * Le barre NON vengono conservate: il chiamante le aggrega ai 96 bucket
 * dell'anno e le butta nella stessa invocazione. Un anno di M15 sull'oro sono
 * ~24.000 barre e ~40 secondi di scarico, quindi la finestra si spezza per
 * anno esattamente come per le orarie.
 */
export async function fetchDukascopyQuarterly(
  symbol: string,
  from: Date,
  to: Date,
): Promise<QuarterBar[]> {
  const { getHistoricRates } = await import("dukascopy-node");
  const rates = await getHistoricRates({
    instrument: symbol as Parameters<typeof getHistoricRates>[0]["instrument"],
    dates: { from, to },
    timeframe: "m15",
    priceType: "bid",
    format: "json",
    useCache: false,
  });

  const out: QuarterBar[] = [];
  for (const bar of rates) {
    const close = bar.close;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    out.push({ ts: new Date(bar.timestamp), close });
  }
  return out;
}
