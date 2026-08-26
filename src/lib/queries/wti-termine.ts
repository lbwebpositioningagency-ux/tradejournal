import { cache } from "react";
import {
  contrattoSuccessivo,
  scadenzaDaNome,
  valutaStruttura,
  type MotivoAssenzaWti,
  type StrutturaWti,
} from "@/lib/wti-termine";

/**
 * Fonte della struttura a termine del WTI: due chiamate a Yahoo, il front e il
 * contratto del mese successivo.
 *
 * Perché a richiesta e non dal job: il SECONDO contratto cambia identità ogni
 * mese, quindi conservarne una serie storica richiederebbe la stessa logica di
 * continuità che rende il future inadatto alla stagionalità. Qui serve il
 * valore di oggi, e il valore di oggi si chiede oggi. Due risposte da qualche
 * KB, dietro la cache di richiesta di React.
 */

const BASE =
  process.env.YAHOO_CHART_BASE_URL ??
  "https://query1.finance.yahoo.com/v8/finance/chart";
const TIMEOUT_MS = 15_000;

interface Quotazione {
  prezzo: number | null;
  nome: string;
  giorno: string | null;
}

/** Ultimo prezzo e nome del contratto, dalla risposta chart di Yahoo. */
export function leggiQuotazione(payload: unknown): Quotazione {
  const vuota: Quotazione = { prezzo: null, nome: "", giorno: null };
  if (payload === null || typeof payload !== "object") return vuota;
  const chart = (payload as { chart?: unknown }).chart;
  if (chart === null || typeof chart !== "object") return vuota;
  const results = (chart as { result?: unknown }).result;
  if (!Array.isArray(results) || results.length === 0) return vuota;
  const meta = (results[0] as { meta?: unknown })?.meta;
  if (meta === null || typeof meta !== "object") return vuota;
  const m = meta as { regularMarketPrice?: unknown; shortName?: unknown; regularMarketTime?: unknown };
  const prezzo =
    typeof m.regularMarketPrice === "number" && Number.isFinite(m.regularMarketPrice)
      ? m.regularMarketPrice
      : null;
  const giorno =
    typeof m.regularMarketTime === "number"
      ? new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10)
      : null;
  return {
    prezzo,
    nome: typeof m.shortName === "string" ? m.shortName : "",
    giorno,
  };
}

async function quota(simbolo: string): Promise<Quotazione> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(simbolo)}?range=1d&interval=1d`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LB-TradingSpace/1.0)" },
        cache: "no-store",
      },
    );
    if (!res.ok) return { prezzo: null, nome: "", giorno: null };
    return leggiQuotazione(await res.json());
  } catch {
    return { prezzo: null, nome: "", giorno: null };
  } finally {
    clearTimeout(timer);
  }
}

export type EsitoStrutturaWti =
  | { ok: true; struttura: StrutturaWti }
  | { ok: false; motivo: MotivoAssenzaWti };

export const getStrutturaWti = cache(async (): Promise<EsitoStrutturaWti> => {
  const front = await quota("CL=F");
  const scadenza = scadenzaDaNome(front.nome);
  const secondo = scadenza
    ? contrattoSuccessivo(scadenza.mese, scadenza.anno)
    : null;
  const q2 = secondo ? await quota(secondo.simbolo) : { prezzo: null, nome: "", giorno: null };

  return valutaStruttura({
    frontPrezzo: front.prezzo,
    frontNome: front.nome,
    frontGiorno: front.giorno,
    secondoPrezzo: q2.prezzo,
    secondo,
  });
});
