/**
 * Finestre a preset dei grafici del journal: logica PURA, senza React,
 * testata a parte. Nessuna navigazione all'indietro: ogni preset mostra la
 * parte PIÙ RECENTE della serie, e per vedere più storia si sceglie un preset
 * più ampio (tavola CD «Grafici temporali - solo preset e Sequenza trade per
 * numero di trade»).
 *
 * - P&L giornaliero e cumulativo: preset di CALENDARIO («30g», «6m»…) contati
 *   all'indietro dall'ultima giornata con trade.
 * - Sequenza trade: preset per NUMERO DI TRADE (25 · 50 · 100 · 200 · Tutti).
 */

export type WindowPreset = "30g" | "90g" | "6m" | "1a" | "all";

export interface WindowRange {
  startIndex: number;
  endIndex: number;
}

export const WINDOW_PRESETS: readonly {
  value: WindowPreset;
  label: string;
  title: string;
}[] = [
  { value: "30g", label: "30g", title: "Ultimi 30 giorni" },
  { value: "90g", label: "90g", title: "Ultimi 90 giorni" },
  { value: "6m", label: "6m", title: "Ultimi 6 mesi" },
  { value: "1a", label: "1a", title: "Ultimo anno" },
  { value: "all", label: "Tutto", title: "Tutto il periodo" },
];

/**
 * Apertura del P&L GIORNALIERO: circa 120 giornate con trade su uno storico
 * pieno — un grafico a barre per giornata resta leggibile solo su una finestra
 * stretta.
 */
export const DEFAULT_WINDOW_PRESET: WindowPreset = "6m";

/**
 * Apertura del P&L CUMULATIVO: tutto lo storico (17/09/2026, richiesta del
 * proprietario). Una curva cumulativa si legge intera, e tagliata a 6 mesi
 * ripartiva da zero a metà della storia.
 */
export const DEFAULT_CUMULATIVE_PRESET: WindowPreset = "all";

/**
 * Primo giorno ESCLUSO dal preset: la finestra contiene le giornate
 * strettamente successive. Aritmetica di calendario pura sulle chiavi
 * "YYYY-MM-DD" (già nel fuso utente): nessun orario, nessun fuso.
 */
export function presetCutoff(lastDay: string, preset: Exclude<WindowPreset, "all">): string {
  const [y, m, d] = lastDay.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (preset === "30g") date.setUTCDate(date.getUTCDate() - 30);
  else if (preset === "90g") date.setUTCDate(date.getUTCDate() - 90);
  else {
    const months = preset === "6m" ? 6 : 12;
    // Fine mese: 31/08 − 6 mesi è il 28/02 (o 29), non il 03/03.
    const target = new Date(Date.UTC(y, m - 1 - months, 1));
    const lastOfMonth = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(d, lastOfMonth));
    return target.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/** Indici della finestra di un preset, ancorata all'ultima giornata. */
export function presetRange(days: readonly string[], preset: WindowPreset): WindowRange {
  const last = days.length - 1;
  if (last < 0) return { startIndex: 0, endIndex: 0 };
  if (preset === "all") return { startIndex: 0, endIndex: last };
  const cutoff = presetCutoff(days[last], preset);
  let start = last;
  while (start > 0 && days[start - 1] > cutoff) start -= 1;
  return { startIndex: start, endIndex: last };
}

export type SequencePreset = "25" | "50" | "100" | "200" | "all";

export const SEQUENCE_PRESETS: readonly {
  value: SequencePreset;
  label: string;
  title: string;
}[] = [
  { value: "25", label: "25", title: "Ultimi 25 trade" },
  { value: "50", label: "50", title: "Ultimi 50 trade" },
  { value: "100", label: "100", title: "Ultimi 100 trade" },
  { value: "200", label: "200", title: "Ultimi 200 trade" },
  { value: "all", label: "Tutti", title: "Tutta la sequenza" },
];

export const DEFAULT_SEQUENCE_PRESET: SequencePreset = "50";

export interface SequenceWindow {
  /** Indice del primo trade visibile nella sequenza (ordine cronologico). */
  start: number;
  /** Trade visibili. */
  count: number;
  /** Preset effettivamente in vigore (acceso nel segmentato). */
  effective: SequencePreset;
  /** Preset da mostrare: quelli che coincidono con «Tutti» non compaiono. */
  options: SequencePreset[];
  /** Falso quando ogni preset mostrerebbe la stessa cosa. */
  showPresets: boolean;
}

/**
 * Finestra degli ultimi N trade su una sequenza di `total` trade.
 *
 * Un preset con N ≥ total mostra tutto: non compare (un pulsante spento a
 * metà opacità scendeva a 2:1 di contrasto), e se era quello scelto (es.
 * dopo un filtro che lascia 60 trade con «100» selezionato) vale «Tutti»,
 * che è ciò che si vede davvero. Con ≤ 25 trade tutti i preset coincidono
 * e il segmentato non serve.
 */
export function sequenceWindow(total: number, preset: SequencePreset): SequenceWindow {
  const size = (p: SequencePreset) => (p === "all" ? Infinity : Number(p));
  const options = SEQUENCE_PRESETS.map((p) => p.value).filter(
    (p) => p === "all" || size(p) < total,
  );
  const effective = options.includes(preset) ? preset : "all";
  const count = Math.min(total, size(effective));
  return {
    start: total - count,
    count,
    effective,
    options,
    showPresets: total > Number(SEQUENCE_PRESETS[0].value),
  };
}
