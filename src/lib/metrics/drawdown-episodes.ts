import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * DURATA DEI DRAWDOWN — per quanto tempo si resta sotto il massimo, e quanto
 * ci vuole a tornarci.
 *
 * Il Max Drawdown dice quanto è stata profonda la buca peggiore; l'Underwater
 * la disegna giorno per giorno. Nessuno dei due risponde alla domanda che pesa
 * davvero nell'esperienza: «quando vado sotto, quanto ci resto?». Qui la
 * curva viene tagliata in EPISODI e di ogni episodio si misura la durata.
 *
 * DEFINIZIONI (sedute della serie giornaliera unica, `daily-series.ts`):
 *  - un episodio inizia dall'ultimo MASSIMO dell'equity prima della discesa
 *    (il saldo di partenza vale come massimo se la serie apre in perdita);
 *  - finisce la prima seduta in cui l'equity torna AL massimo precedente o
 *    sopra: pari conta come recuperato, perché la perdita è stata riassorbita;
 *  - durata = sedute dal massimo al recupero; discesa = dal massimo al minimo;
 *    recupero = dal minimo al ritorno sul massimo;
 *  - l'episodio ancora aperto a fine serie NON entra nelle statistiche: la sua
 *    durata è un minimo, non un valore. Si mostra a parte.
 *
 * La distribuzione delle durate è asimmetrica con coda lunga a destra: molti
 * episodi da due o tre sedute, pochi da decine. Per questo si descrive con
 * fasce e mediana, mai con media e deviazione standard.
 *
 * Sedute, non giorni di calendario: la serie contiene i soli feriali (e i
 * weekend con P&L reale), come Sharpe e Sortino.
 */

export interface DrawdownEpisode {
  /** Giorno del massimo da cui parte la discesa; null = saldo di partenza. */
  peakDay: string | null;
  troughDay: string;
  /** Giorno del ritorno sul massimo; null = episodio ancora aperto. */
  recoveryDay: string | null;
  /** Profondità massima in valuta (positiva, scala 2). */
  depth: string;
  /** Profondità come frazione del massimo (scala 4); null se il massimo ≤ 0. */
  depthPct: string | null;
  /** Sedute dal massimo al recupero (o all'ultima seduta, se aperto). */
  durationSessions: number;
  /** Sedute dal massimo al minimo. */
  declineSessions: number;
  /** Sedute dal minimo al recupero; per l'aperto, dal minimo a oggi. */
  recoverySessions: number;
}

/**
 * Taglia la serie giornaliera in episodi di drawdown, in ordine cronologico.
 * `days` deve essere la serie unica (`dailyReturns`) in ordine crescente.
 */
export function drawdownEpisodes(
  days: { day: string; netPnl: string }[],
  startingEquity: string,
): DrawdownEpisode[] {
  const episodes: DrawdownEpisode[] = [];
  let equity = new Decimal(startingEquity);
  let peak = equity;
  let peakIdx = -1;

  let open: { peakIdx: number; troughIdx: number; depth: Decimal } | null = null;

  const close = (endIdx: number | null) => {
    if (!open) return;
    const last = days.length - 1;
    const end = endIdx ?? last;
    episodes.push({
      peakDay: open.peakIdx < 0 ? null : days[open.peakIdx].day,
      troughDay: days[open.troughIdx].day,
      recoveryDay: endIdx === null ? null : days[endIdx].day,
      depth: open.depth.toFixed(2),
      depthPct: peak.gt(0) ? open.depth.div(peak).toFixed(4) : null,
      durationSessions: end - open.peakIdx,
      declineSessions: open.troughIdx - open.peakIdx,
      recoverySessions: end - open.troughIdx,
    });
    open = null;
  };

  for (let i = 0; i < days.length; i++) {
    equity = equity.plus(days[i].netPnl);
    if (equity.gte(peak)) {
      // Il recupero si misura rispetto al massimo PRECEDENTE: la chiusura
      // dell'episodio legge `peak` prima che venga aggiornato.
      close(i);
      peak = equity;
      peakIdx = i;
      continue;
    }
    const depth = peak.minus(equity);
    if (!open) {
      open = { peakIdx, troughIdx: i, depth };
    } else if (depth.gt(open.depth)) {
      open.troughIdx = i;
      open.depth = depth;
    }
  }
  close(null);
  return episodes;
}

// ── Sintesi per la pagina ────────────────────────────────────────────────

/**
 * Episodi chiusi minimi per una durata TIPICA e per la forma della
 * distribuzione. Sotto, la mediana di una manciata di episodi è quasi un
 * episodio a caso: con 10 durate l'intervallo al 95% della mediana va dalla
 * 2ª alla 9ª osservazione, cioè copre quasi tutto ciò che si è visto. Con 20
 * si stringe dalla 6ª alla 15ª: ancora largo, ma comincia a dire qualcosa.
 */
export const DRAWDOWN_EPISODES_MIN = 20;

/**
 * Fasce di durata in sedute. Tarate su SIM1 (37 episodi chiusi, mediana 3,
 * 90° percentile 13, massimo 100): le prime due separano il rumore di una
 * giornata storta, le ultime tengono la coda senza una barra per ogni caso.
 */
export const DRAWDOWN_BANDS = [
  { key: "1-2", label: "1–2", min: 1, max: 2 },
  { key: "3-5", label: "3–5", min: 3, max: 5 },
  { key: "6-10", label: "6–10", min: 6, max: 10 },
  { key: "11-20", label: "11–20", min: 11, max: 20 },
  { key: "21-40", label: "21–40", min: 21, max: 40 },
  { key: "41+", label: "oltre 40", min: 41, max: Number.POSITIVE_INFINITY },
] as const;

/** Soglie di profondità selezionabili, come frazione del massimo. */
export const DRAWDOWN_DEPTH_FILTERS = [
  { key: "0", label: "Tutti", minPct: null },
  { key: "1", label: "Oltre 1%", minPct: "0.01" },
  { key: "3", label: "Oltre 3%", minPct: "0.03" },
] as const;
export type DrawdownDepthKey = (typeof DRAWDOWN_DEPTH_FILTERS)[number]["key"];

export interface DrawdownBand {
  key: string;
  label: string;
  /** Episodi chiusi con DURATA in questa fascia. */
  duration: number;
  /** Episodi chiusi con RECUPERO in questa fascia. */
  recovery: number;
}

export interface DurationStats {
  /** Mediana in sedute (può valere x,5); null sotto campione. */
  median: string | null;
  /** Il più lungo osservato: un fatto, esiste da un episodio in su. */
  worst: number | null;
}

export interface DrawdownDurationSummary {
  /** Episodi chiusi che superano la soglia di profondità. */
  closed: DrawdownEpisode[];
  /** L'episodio aperto a fine serie, se supera la soglia. */
  open: DrawdownEpisode | null;
  /** Episodi chiusi lasciati fuori dalla soglia di profondità. */
  belowDepth: number;
  lowSample: boolean;
  bands: DrawdownBand[];
  duration: DurationStats;
  recovery: DurationStats;
}

function median(values: number[]): string | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? String(sorted[mid])
    : new Decimal(sorted[mid - 1]).plus(sorted[mid]).div(2).toString();
}

function passesDepth(episode: DrawdownEpisode, minPct: string | null): boolean {
  if (minPct === null) return true;
  // Massimo ≤ 0: il conto è già a zero, nessuna percentuale lo descrive e
  // nessuna soglia deve nasconderlo.
  if (episode.depthPct === null) return true;
  return new Decimal(episode.depthPct).gte(minPct);
}

export function drawdownDurationSummary(
  episodes: DrawdownEpisode[],
  minDepthPct: string | null = null,
): DrawdownDurationSummary {
  const allClosed = episodes.filter((e) => e.recoveryDay !== null);
  const closed = allClosed.filter((e) => passesDepth(e, minDepthPct));
  const last = episodes.at(-1);
  const open =
    last && last.recoveryDay === null && passesDepth(last, minDepthPct) ? last : null;
  const lowSample = closed.length < DRAWDOWN_EPISODES_MIN;

  const durations = closed.map((e) => e.durationSessions);
  const recoveries = closed.map((e) => e.recoverySessions);
  const inBand = (v: number, b: (typeof DRAWDOWN_BANDS)[number]) =>
    v >= b.min && v <= b.max;

  return {
    closed,
    open,
    belowDepth: allClosed.length - closed.length,
    lowSample,
    bands: DRAWDOWN_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      duration: durations.filter((v) => inBand(v, b)).length,
      recovery: recoveries.filter((v) => inBand(v, b)).length,
    })),
    duration: {
      median: lowSample ? null : median(durations),
      worst: durations.length === 0 ? null : Math.max(...durations),
    },
    recovery: {
      median: lowSample ? null : median(recoveries),
      worst: recoveries.length === 0 ? null : Math.max(...recoveries),
    },
  };
}

export const drawdownDurationInfo: MetricInfoData = {
  label: "Durata dei drawdown",
  description:
    "Per quante sedute l'equity resta sotto il suo massimo prima di tornarci, episodio per episodio, e quanto dura la sola risalita dal punto più basso. È la parte del drawdown che si vive: una perdita del 5% recuperata in tre sedute e una recuperata in tre mesi hanno lo stesso Max Drawdown e pesano in modo opposto. La distribuzione ha una coda lunga a destra, quindi si legge per fasce e mediana, non con una media.",
  formula:
    "Episodio = dal massimo dell'equity alla prima seduta che lo raggiunge di nuovo · durata = massimo → recupero · recupero = minimo → recupero · sedute feriali della serie giornaliera",
  note: "Calcolato sul P&L realizzato per giorno di chiusura. L'episodio ancora aperto non entra nelle statistiche: la sua durata è solo un minimo.",
};
