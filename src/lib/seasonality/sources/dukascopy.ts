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
    out.push({
      date: new Date(bar.timestamp).toISOString().slice(0, 10),
      close,
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
