/**
 * Trasformazioni di serie — modulo PURO (nessuna rete, nessun database).
 * Prende barre giornaliere e produce le osservazioni su cui il kernel
 * statistico lavora.
 *
 * Convenzioni fissate qui una volta per tutte:
 * - le date sono stringhe "YYYY-MM-DD" (data civile, senza fuso: una
 *   chiusura giornaliera non ha un'ora, e trattarla come istante
 *   introdurrebbe uno slittamento di un giorno a ogni cambio di fuso);
 * - i rendimenti sono LOGARITMICI, perché si sommano nel tempo — ed è ciò
 *   che rende sensato cumularli lungo l'anno e mediarli senza l'asimmetria
 *   dei rendimenti semplici (+10% e −10% semplici non tornano al punto di
 *   partenza, in log sì);
 * - la conversione a percentuale avviene SOLO in fase di display.
 */

export interface DailyBar {
  /** "YYYY-MM-DD" */
  date: string;
  close: number;
}

export interface DailyReturn {
  date: string;
  /** ln(P_t / P_{t-1}) */
  r: number;
}

export interface MonthlyObservation {
  year: number;
  month: number;
  /** RETURN: rendimento log del mese. LEVEL: livello medio del mese. */
  value: number;
  /** Giorni di quotazione che compongono il mese. */
  days: number;
}

/** Rendimento log → percentuale semplice, per il display. */
export function logToPercent(logReturn: number): number {
  return (Math.expm1(logReturn)) * 100;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/**
 * Ordina e deduplica le barre per data. Le fonti non garantiscono l'ordine e
 * una catena di fallback può restituire lo stesso giorno due volte: senza
 * questa normalizzazione un duplicato produrrebbe un rendimento zero
 * fantasma, che sporcherebbe hit rate e deviazione standard.
 */
export function normalizeBars(bars: DailyBar[]): DailyBar[] {
  const byDate = new Map<string, number>();
  for (const b of bars) {
    if (!Number.isFinite(b.close) || b.close <= 0) continue; // prezzo nullo o negativo: non è un prezzo
    byDate.set(b.date, b.close);
  }
  return [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Rendimenti logaritmici giorno su giorno. La prima barra non produce
 * rendimento (non ha un precedente): è un'assenza, non uno zero.
 *
 * NON viene inserito nessun filtro sulla distanza fra due barre: un ponte
 * festivo o un weekend producono legittimamente il rendimento del periodo
 * chiuso, che è esattamente il rendimento che un possessore avrebbe
 * realizzato.
 */
export function dailyLogReturns(bars: DailyBar[]): DailyReturn[] {
  const out: DailyReturn[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev <= 0 || cur <= 0) continue;
    out.push({ date: bars[i].date, r: Math.log(cur / prev) });
  }
  return out;
}

/** Ultima chiusura di ogni mese, in ordine cronologico. */
function monthEnds(
  bars: DailyBar[],
): { year: number; month: number; close: number; days: number }[] {
  const out: { year: number; month: number; close: number; days: number }[] = [];
  for (const bar of bars) {
    const { year, month } = parseDate(bar.date);
    const last = out[out.length - 1];
    if (last && last.year === year && last.month === month) {
      last.close = bar.close; // le barre sono ordinate: l'ultima vista è la chiusura del mese
      last.days += 1;
    } else {
      out.push({ year, month, close: bar.close, days: 1 });
    }
  }
  return out;
}

/**
 * Rendimenti MENSILI: chiusura di fine mese contro chiusura di fine mese
 * PRECEDENTE.
 *
 * Guardia deliberata: il rendimento viene prodotto solo se il mese precedente
 * è davvero il mese di calendario precedente. Senza questo controllo un buco
 * nell'archivio (ne abbiamo uno accertato sul WTI intraday, e le fonti
 * giornaliere non sono immuni) produrrebbe un "rendimento mensile" che copre
 * due o tre mesi, attribuito per intero a un mese solo: un valore enorme in
 * una casella della heatmap, che sembrerebbe un dato e sarebbe un artefatto.
 */
export function monthlyLogReturns(bars: DailyBar[]): MonthlyObservation[] {
  const ends = monthEnds(bars);
  const out: MonthlyObservation[] = [];
  for (let i = 1; i < ends.length; i += 1) {
    const prev = ends[i - 1];
    const cur = ends[i];
    const expectedMonth = prev.month === 12 ? 1 : prev.month + 1;
    const expectedYear = prev.month === 12 ? prev.year + 1 : prev.year;
    if (cur.year !== expectedYear || cur.month !== expectedMonth) continue;
    if (prev.close <= 0 || cur.close <= 0) continue;
    out.push({
      year: cur.year,
      month: cur.month,
      value: Math.log(cur.close / prev.close),
      days: cur.days,
    });
  }
  return out;
}

/** Livello MEDIO di ogni mese (indici di volatilità: nessun rendimento). */
export function monthlyMeanLevels(bars: DailyBar[]): MonthlyObservation[] {
  const acc = new Map<string, { year: number; month: number; sum: number; days: number }>();
  for (const bar of bars) {
    const { year, month } = parseDate(bar.date);
    const key = `${year}-${month}`;
    const cur = acc.get(key);
    if (cur) {
      cur.sum += bar.close;
      cur.days += 1;
    } else {
      acc.set(key, { year, month, sum: bar.close, days: 1 });
    }
  }
  return [...acc.values()]
    .map((m) => ({
      year: m.year,
      month: m.month,
      value: m.sum / m.days,
      days: m.days,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

/**
 * DETREND — toglie a ogni osservazione la media generale dell'insieme.
 *
 * Risponde a una domanda diversa da quella grezza: *questo mese è forte
 * perché è settembre, o perché in quegli anni lo strumento saliva sempre?*
 * Un ventennio di rialzo rende "positivi" dieci mesi su dodici; il detrend
 * toglie la marea e lascia l'onda.
 *
 * Per costruzione la media delle osservazioni detrendizzate è zero: è la
 * verifica che il conto sia giusto, ed è anche il motivo per cui NON è la
 * vista di default — non è quello che è successo, è una lente.
 */
export function detrend(values: number[]): number[] {
  if (values.length === 0) return [];
  let sum = 0;
  for (const v of values) sum += v;
  const m = sum / values.length;
  return values.map((v) => v - m);
}

/**
 * Percorso stagionale: per ogni anno, il rendimento log CUMULATO dal 1°
 * gennaio a ciascun giorno dell'anno (1-366).
 *
 * Nei giorni senza quotazione il valore viene RIPORTATO dal giorno
 * precedente, non azzerato: un mercato chiuso non è un mercato tornato a
 * zero. Prima della prima quotazione dell'anno il cumulato vale 0.
 *
 * Il giorno 366 esiste solo negli anni bisestili: quel punto avrà `n` più
 * basso, ed è corretto che sia così.
 */
export function cumulativePathsByYear(
  returns: DailyReturn[],
): Map<number, number[]> {
  const byYear = new Map<number, DailyReturn[]>();
  for (const r of returns) {
    const year = Number(r.date.slice(0, 4));
    const list = byYear.get(year);
    if (list) list.push(r);
    else byYear.set(year, [r]);
  }

  const paths = new Map<number, number[]>();
  for (const [year, list] of byYear) {
    const path = new Array<number>(367).fill(0);
    const start = Date.UTC(year, 0, 1);
    let cum = 0;
    let cursor = 1;
    for (const item of list) {
      const { month, day } = parseDate(item.date);
      const doy =
        Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000) + 1;
      // Riporta il valore corrente fino al giorno prima di questa quotazione.
      for (; cursor < doy; cursor += 1) path[cursor] = cum;
      cum += item.r;
      path[doy] = cum;
      cursor = doy + 1;
    }
    for (; cursor <= 366; cursor += 1) path[cursor] = cum;
    paths.set(year, path);
  }
  return paths;
}

/**
 * Livello medio per giorno dell'anno, l'analogo del percorso per gli indici
 * di volatilità: non si cumula niente (un livello non compone), si riporta
 * il livello osservato e nei giorni chiusi vale l'ultimo noto.
 */
export function levelPathsByYear(bars: DailyBar[]): Map<number, number[]> {
  const byYear = new Map<number, DailyBar[]>();
  for (const bar of bars) {
    const year = Number(bar.date.slice(0, 4));
    const list = byYear.get(year);
    if (list) list.push(bar);
    else byYear.set(year, [bar]);
  }

  const paths = new Map<number, number[]>();
  for (const [year, list] of byYear) {
    const path = new Array<number>(367).fill(Number.NaN);
    const start = Date.UTC(year, 0, 1);
    let last = Number.NaN;
    let cursor = 1;
    for (const bar of list) {
      const { month, day } = parseDate(bar.date);
      const doy =
        Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000) + 1;
      for (; cursor < doy; cursor += 1) path[cursor] = last;
      last = bar.close;
      path[doy] = last;
      cursor = doy + 1;
    }
    for (; cursor <= 366; cursor += 1) path[cursor] = last;
    paths.set(year, path);
  }
  return paths;
}
