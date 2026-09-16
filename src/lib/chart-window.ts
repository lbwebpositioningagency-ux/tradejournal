/**
 * Finestra scorrevole dei grafici giornalieri della Dashboard (P&L
 * giornaliero e cumulativo): logica PURA, senza React, testata a parte.
 *
 * La finestra si esprime in INDICI della serie (una barra = una giornata con
 * trade), perché è così che la striscia `<Brush>` di Recharts la conosce. I
 * preset invece parlano di CALENDARIO — «30g», «6m» — e vengono tradotti in
 * indici contando all'indietro dall'ultima giornata. Da lì in poi l'ampiezza
 * è un numero di barre: trascinando la striscia la finestra scorre nel tempo
 * senza allargarsi né stringersi.
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

/** Circa 120 giornate con trade su uno storico pieno: metà o meno di tutto. */
export const DEFAULT_WINDOW_PRESET: WindowPreset = "6m";

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

/**
 * Riporta una selezione della striscia dentro la serie, distinguendo i due
 * gesti possibili:
 * - **scorrimento** (cambiano entrambi gli estremi): l'ampiezza resta quella
 *   di prima. La striscia converte pixel in indici e sposta gli estremi di
 *   ±1 in modo indipendente: senza questa regola la finestra «respirerebbe»
 *   durante il trascinamento e il preset si spegnerebbe da solo;
 * - **maniglia** (cambia un estremo solo): è un'ampiezza scelta a mano, e
 *   `keepsPreset` è falso.
 */
export function nextRange(
  current: WindowRange,
  proposed: WindowRange,
  length: number,
): { range: WindowRange; keepsPreset: boolean } {
  const last = Math.max(0, length - 1);
  const clamp = (n: number) => Math.min(last, Math.max(0, n));
  const startMoved = proposed.startIndex !== current.startIndex;
  const endMoved = proposed.endIndex !== current.endIndex;
  if (startMoved && endMoved) {
    const span = current.endIndex - current.startIndex;
    const start = Math.min(clamp(proposed.startIndex), Math.max(0, last - span));
    return { range: { startIndex: start, endIndex: start + span }, keepsPreset: true };
  }
  if (!startMoved && !endMoved) return { range: current, keepsPreset: true };
  const start = clamp(Math.min(proposed.startIndex, proposed.endIndex));
  const end = clamp(Math.max(proposed.startIndex, proposed.endIndex));
  return { range: { startIndex: start, endIndex: end }, keepsPreset: false };
}
