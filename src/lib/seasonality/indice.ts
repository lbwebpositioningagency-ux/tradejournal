/**
 * INDICE STAGIONALE — modulo PURO (nessuna rete, nessun database).
 *
 * È il motore del grafico a linee della Stagionalità dal 15/09/2026. La
 * pipeline è fissata qui e in quest'ordine, senza scorciatoie:
 *
 *   prezzi storici
 *   → rendimenti log giornalieri            ln(P_t / P_{t-1})
 *   → media dei rendimenti per giorno dell'anno, sugli anni della finestra
 *   → cumulata dal 1° gennaio
 *   → indice a base 100                     I_s = 100 · e^(Σ_{k≤s} r̄_k)
 *
 * L'indice serve a leggere la FORMA del percorso medio — dove sale, dove
 * scende, dov'è il minimo — non l'ampiezza: un 112 non è un «+12%» da
 * aspettarsi, e l'ampiezza reale sta nelle tabelle, in percentuale.
 *
 * ── Tre scelte che la verifica del 15/09/2026 ha reso necessarie ─────────
 *
 * 1. CALENDARIO NON BISESTILE. Il giorno dell'anno di calendario sposta di
 *    uno ogni data dopo febbraio negli anni bisestili: si mediavano giorni
 *    diversi (fino a 3,5 punti di scarto sul WTI, aprile 2020). Qui il giorno
 *    è la posizione nel calendario di un anno di 365 giorni, e il 29 febbraio
 *    si somma al 28.
 * 2. SOLO SEDUTE FERIALI. La serie giornaliera dell'oro ha ~52 barre di
 *    domenica l'anno (la riapertura serale del CFD): si fondono nel lunedì,
 *    che è la giornata di contrattazione a cui appartengono.
 * 3. ANCHE GLI INDICI DI VOLATILITÀ passano dalle variazioni log. Prima la
 *    loro curva era la media dei livelli per giorno dell'anno; le tabelle
 *    restano in livelli, perché lì il livello è l'informazione.
 *
 * La banda è il primo e il terzo quartile dei percorsi dei singoli anni,
 * nella stessa scala: dove è stretta la forma è ricorrente, dove è larga la
 * media è tirata da pochi anni. I quantili commutano con l'esponenziale,
 * quindi calcolarli in log e convertire dopo dà esattamente i quartili
 * dell'indice.
 *
 * I valori viaggiano in LOG (additivi) fino al display: `aIndice` è l'unica
 * conversione.
 */

import { dayOfYear, isoWeekday } from "@/lib/seasonality/buckets";
import {
  dailyLogReturns,
  hasOhlc,
  type DailyBar,
} from "@/lib/seasonality/series";
import { quantileSorted } from "@/lib/seasonality/stats";

/** Giorni del calendario dell'indice: un anno non bisestile. */
export const GIORNI_INDICE = 365;
/** Valore dell'indice al punto di partenza (giorno 0, chiusura dell'anno prima). */
export const BASE_INDICE = 100;
/** Semiampiezza della media mobile centrata: 2 → cinque giorni. */
export const RAGGIO_LISCIATURA = 2;

const GIORNO_MS = 86_400_000;

/**
 * Posizione di una data nel calendario non bisestile: 1 = 1° gennaio,
 * 59 = 28 febbraio (e 29 febbraio), 60 = 1° marzo, 365 = 31 dicembre.
 */
export function giornoStagionale(date: string): number {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return dayOfYear(2001, month, month === 2 && day === 29 ? 28 : day);
}

function giorniFra(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / GIORNO_MS);
}

function giornoSettimana(date: string): number {
  return isoWeekday(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  );
}

/**
 * Le barre di sabato e domenica si FONDONO nella prima seduta feriale che le
 * segue entro tre giorni: la chiusura resta quella del lunedì, il massimo e il
 * minimo si allargano a comprendere la sessione del weekend, l'apertura è
 * quella del weekend. Se una delle barre fuse non ha massimo e minimo, la
 * seduta risultante non li ha: un massimo che ignora metà della sessione
 * sarebbe un dato falso con l'aria di essere vero.
 *
 * Una barra di weekend SENZA una seduta feriale vicina (serie rade, fine
 * serie) resta com'è: fonderla in una data lontana sposterebbe un prezzo in
 * un altro periodo.
 *
 * Le barre in archivio non si toccano: la fusione avviene solo qui, nel
 * calcolo. Le usa anche la sezione Volatilità, che ha le sue regole.
 */
export function soloSeduteFeriali(bars: readonly DailyBar[]): DailyBar[] {
  const out: DailyBar[] = [];
  let weekend: DailyBar[] = [];
  for (const bar of bars) {
    if (giornoSettimana(bar.date) >= 6) {
      weekend.push(bar);
      continue;
    }
    if (weekend.length === 0) {
      out.push(bar);
      continue;
    }
    const vicine = weekend.filter((w) => giorniFra(w.date, bar.date) <= 3);
    out.push(...weekend.filter((w) => giorniFra(w.date, bar.date) > 3));
    out.push(vicine.length > 0 ? fondi(vicine, bar) : bar);
    weekend = [];
  }
  out.push(...weekend);
  return out;
}

function fondi(weekend: readonly DailyBar[], seduta: DailyBar): DailyBar {
  const tutte = [...weekend, seduta];
  if (!tutte.every(hasOhlc)) return { date: seduta.date, close: seduta.close };
  return {
    date: seduta.date,
    close: seduta.close,
    open: weekend[0].open,
    high: Math.max(...tutte.map((b) => b.high!)),
    low: Math.min(...tutte.map((b) => b.low!)),
  };
}

/**
 * Rendimenti log giornalieri raccolti per anno e per giorno stagionale:
 * `mappa.get(anno)[giorno]` è la somma dei rendimenti di quel giorno (più di
 * uno solo il 28 febbraio dei bisestili). Indice 0 inutilizzato; i giorni
 * senza seduta valgono 0, che è ciò che è accaduto: niente.
 *
 * Il primo rendimento di un anno è calcolato sull'ultima chiusura dell'anno
 * prima: appartiene all'anno in cui cade la seduta.
 */
export function rendimentiPerGiorno(
  bars: readonly DailyBar[],
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const r of dailyLogReturns([...bars])) {
    const year = Number(r.date.slice(0, 4));
    let giorni = out.get(year);
    if (!giorni) {
      giorni = new Array<number>(GIORNI_INDICE + 1).fill(0);
      out.set(year, giorni);
    }
    giorni[giornoStagionale(r.date)] += r.r;
  }
  return out;
}

/**
 * Anni solari COMPLETI: sedute in tutti i dodici mesi, la prima entro il 10
 * gennaio, l'ultima dal 20 dicembre, e una seduta nel dicembre precedente (il
 * primo rendimento dell'anno ne ha bisogno). Un anno che non lo è non entra in
 * nessuna finestra: una finestra che lo contiene si omette, non si riempie.
 */
export function anniCompleti(bars: readonly DailyBar[]): Set<number> {
  const perAnno = new Map<number, { mesi: Set<number>; primo: string; ultimo: string }>();
  for (const b of bars) {
    const year = Number(b.date.slice(0, 4));
    const cur = perAnno.get(year);
    if (cur) {
      cur.mesi.add(Number(b.date.slice(5, 7)));
      if (b.date < cur.primo) cur.primo = b.date;
      if (b.date > cur.ultimo) cur.ultimo = b.date;
    } else {
      perAnno.set(year, {
        mesi: new Set([Number(b.date.slice(5, 7))]),
        primo: b.date,
        ultimo: b.date,
      });
    }
  }
  const out = new Set<number>();
  for (const [year, a] of perAnno) {
    const prima = perAnno.get(year - 1);
    if (
      a.mesi.size === 12 &&
      a.primo.slice(5) <= "01-10" &&
      a.ultimo.slice(5) >= "12-20" &&
      prima !== undefined &&
      prima.mesi.has(12)
    ) {
      out.add(year);
    }
  }
  return out;
}

export interface PuntoIndice {
  /** 0 = partenza (chiusura dell'anno precedente), 1..365 = giorni. */
  giorno: number;
  /** Cumulata della media dei rendimenti: log dell'indice / 100. */
  mediaCum: number;
  /** Mediana, primo e terzo quartile dei percorsi dei singoli anni, in log. */
  medianaCum: number;
  q1Cum: number;
  q3Cum: number;
  /** Quota di anni col percorso sopra la partenza (indice > 100) a quel giorno. */
  quotaSopra: number;
  /** Anni che compongono il punto: sempre tutti quelli della finestra. */
  n: number;
}

/**
 * Il percorso dell'indice per una finestra di anni. Restituisce `[]` se anche
 * un solo anno richiesto manca in `perAnno`: la finestra non ha dati
 * sufficienti e non si approssima con quelli che ci sono.
 *
 * `detrend` toglie la deriva media della finestra, cioè la retta che va da 0
 * alla cumulata di fine anno: la curva parte e finisce a 100 e resta la sola
 * forma. Si toglie la stessa retta a ogni anno, così la banda resta coerente.
 */
export function percorsoIndice(opts: {
  perAnno: ReadonlyMap<number, readonly number[]>;
  anni: readonly number[];
  detrend?: boolean;
}): PuntoIndice[] {
  const serie: (readonly number[])[] = [];
  for (const anno of opts.anni) {
    const giorni = opts.perAnno.get(anno);
    if (!giorni) return [];
    serie.push(giorni);
  }
  const n = serie.length;
  if (n === 0) return [];

  // Media dei rendimenti per giorno stagionale, POI la cumulata.
  const cum = new Array<number>(GIORNI_INDICE + 1).fill(0);
  for (let g = 1; g <= GIORNI_INDICE; g += 1) {
    let somma = 0;
    for (const giorni of serie) somma += giorni[g];
    cum[g] = cum[g - 1] + somma / n;
  }
  const deriva = opts.detrend ? cum[GIORNI_INDICE] / GIORNI_INDICE : 0;

  // Percorso di ogni anno, per la banda.
  const percorsiAnni = serie.map((giorni) => {
    const p = new Array<number>(GIORNI_INDICE + 1).fill(0);
    for (let g = 1; g <= GIORNI_INDICE; g += 1) p[g] = p[g - 1] + giorni[g];
    return p;
  });

  const punti: PuntoIndice[] = [];
  for (let g = 0; g <= GIORNI_INDICE; g += 1) {
    const tolta = deriva * g;
    const valori = percorsiAnni.map((p) => p[g] - tolta).sort((a, b) => a - b);
    punti.push({
      giorno: g,
      mediaCum: cum[g] - tolta,
      medianaCum: quantileSorted(valori, 0.5),
      q1Cum: quantileSorted(valori, 0.25),
      q3Cum: quantileSorted(valori, 0.75),
      quotaSopra: valori.filter((v) => v > 0).length / n,
      n,
    });
  }
  return punti;
}

/**
 * Il percorso dell'anno in corso fino al giorno `finoA` compreso, in log:
 * un anno solo, nessuna media e nessuna banda.
 */
export function percorsoAnno(
  giorni: readonly number[] | undefined,
  finoA: number,
): number[] {
  if (!giorni) return [];
  const out = [0];
  const ultimo = Math.min(finoA, GIORNI_INDICE);
  for (let g = 1; g <= ultimo; g += 1) out.push(out[g - 1] + giorni[g]);
  return out;
}

/** Log cumulato → valore dell'indice. L'unica conversione verso il display. */
export function aIndice(logCum: number): number {
  return BASE_INDICE * Math.exp(logCum);
}

/**
 * Media mobile CENTRATA: il valore del giorno g è la media da g−r a g+r. Ai
 * bordi il raggio si accorcia allo stesso modo da tutti e due i lati, così la
 * media resta centrata e il punto di partenza (100) non viene toccato.
 * I `null` (giorni fuori dati) restano `null` e non entrano nelle medie.
 */
export function mediaMobileCentrata(
  valori: readonly (number | null)[],
  raggio: number = RAGGIO_LISCIATURA,
): (number | null)[] {
  return valori.map((v, i) => {
    if (v === null) return null;
    const r = Math.min(raggio, i, valori.length - 1 - i);
    let somma = 0;
    let conta = 0;
    for (let k = i - r; k <= i + r; k += 1) {
      const x = valori[k];
      if (x === null) continue;
      somma += x;
      conta += 1;
    }
    return somma / conta;
  });
}
