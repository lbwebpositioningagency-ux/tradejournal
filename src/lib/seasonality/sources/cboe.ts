/**
 * Fonte CBOE — SOLO server-side, CDN pubblico e keyless.
 *
 * `cdn.cboe.com/api/global/us_indices/daily_prices/<INDICE>_History.csv` è il
 * canale con cui il CBOE ridistribuisce i propri indici di volatilità. È la
 * fonte PRIMARIA di quei dati: FRED li ripubblica con un giorno di ritardo e
 * appiattiti alla sola chiusura.
 *
 * Misurato il 26/08/2026, con FRED a confronto:
 *
 *   indice   CBOE            FRED            scarto sulle date comuni
 *   VIX      1990-01-02 →    1990-01-02 →    0,0000 su 9.257 sedute
 *            2026-08-25      2026-08-24
 *   GVZ      2009-09-18 →    2008-06-03 →    0,0000 su 4.256 sedute
 *   OVX      2009-09-18 →    2007-05-10 →    0,0000 su 4.256 sedute
 *
 * DUE FATTI CHE CAMBIANO IL DISEGNO, entrambi contro l'intuizione:
 *
 *  1. sulle date comuni i valori coincidono ESATTAMENTE — non «quasi»: scarto
 *     massimo zero a quattro decimali. Le due fonti si possono quindi cucire
 *     senza rischio di gradini artificiali;
 *  2. ma su GVZ e OVX il CBOE parte DOPO: 331 sedute in meno sull'oro, 599 sul
 *     petrolio. Sostituire FRED con CBOE accorcerebbe il rango storico, che è
 *     il fatto su cui l'intera sezione Volatilità poggia.
 *
 * Da qui la scelta: CBOE primario per la freschezza e per l'OHLC, FRED usato
 * per ESTENDERE all'indietro (v. `estendiStorico` in `sources/index.ts`).
 *
 * Formato: due varianti, entrambe con date `MM/DD/YYYY`.
 *   `DATE,OPEN,HIGH,LOW,CLOSE`  → VIX, VIX9D, VIX3M
 *   `DATE,<SIGLA>`              → GVZ, OVX
 * Il parser le riconosce da sé: non si passa un flag che può disallinearsi
 * dalla realtà del file.
 */

import type { DailyBar } from "@/lib/seasonality/series";

const BASE =
  process.env.CBOE_INDICES_BASE_URL ??
  "https://cdn.cboe.com/api/global/us_indices/daily_prices";
const TIMEOUT_MS = 30_000;

/** `MM/DD/YYYY` → `YYYY-MM-DD`; null se la forma non è quella. */
export function cboeDateKey(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function numero(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const v = Number.parseFloat(raw.trim());
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * Parser puro del CSV. Si testa senza rete, come quello di Yahoo.
 *
 * Righe con la chiusura mancante o non positiva vengono SCARTATE: sono
 * osservazioni assenti, mai zeri. L'OHLC esce solo se il file ha davvero le
 * quattro colonne — sulle serie a colonna singola resta assente, che è la
 * verità e non una mancanza da riparare.
 */
export function parseCboeCsv(testo: string): DailyBar[] {
  const righe = testo.split(/\r?\n/).filter((r) => r.trim() !== "");
  if (righe.length < 2) return [];

  const intestazione = righe[0].split(",").map((c) => c.trim().toUpperCase());
  if (intestazione[0] !== "DATE") return [];
  const iOpen = intestazione.indexOf("OPEN");
  const iHigh = intestazione.indexOf("HIGH");
  const iLow = intestazione.indexOf("LOW");
  const iClose = intestazione.indexOf("CLOSE");
  // Colonna singola: la chiusura è la seconda colonna, comunque si chiami.
  const iValore = iClose >= 0 ? iClose : 1;
  const conOhlc = iOpen >= 0 && iHigh >= 0 && iLow >= 0 && iClose >= 0;

  const fuori: DailyBar[] = [];
  for (let i = 1; i < righe.length; i += 1) {
    const celle = righe[i].split(",");
    const date = cboeDateKey(celle[0] ?? "");
    if (date === null) continue;
    const close = numero(celle[iValore]);
    if (close === undefined) continue;
    fuori.push(
      conOhlc
        ? {
            date,
            close,
            open: numero(celle[iOpen]),
            high: numero(celle[iHigh]),
            low: numero(celle[iLow]),
          }
        : { date, close },
    );
  }
  return fuori;
}

export async function fetchCboeDaily(simbolo: string): Promise<DailyBar[]> {
  const url = `${BASE}/${encodeURIComponent(simbolo)}_History.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LB-TradingSpace/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CBOE ${simbolo}: HTTP ${res.status}`);
    const barre = parseCboeCsv(await res.text());
    if (barre.length === 0) {
      throw new Error(`CBOE ${simbolo}: nessuna barra valida nel CSV`);
    }
    return barre;
  } finally {
    clearTimeout(timer);
  }
}
