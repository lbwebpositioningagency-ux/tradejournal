import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * CORRELAZIONE FRA STRATEGIE sui P&L GIORNALIERI.
 *
 * La domanda è «sto davvero diversificando, o le mie strategie perdono tutte
 * lo stesso giorno?». È la domanda che nessuna metrica per-strategia può
 * rispondere: profit factor ed expectancy guardano una riga alla volta, e
 * due strategie ottime che vanno male insieme fanno un conto peggiore di due
 * strategie mediocri che si alternano.
 *
 * SUI RENDIMENTI, NON SUI PREZZI. Correlare i prezzi di GC e NQ direbbe
 * qualcosa sul mercato; correlare le GIORNATE del proprio trading dice
 * qualcosa sul proprio trading — che è l'unica cosa su cui si può agire.
 *
 * DUE CALENDARI, ognuno per il suo scopo.
 *
 * Il COEFFICIENTE si calcola sull'unione dei giorni in cui almeno una delle
 * due ha operato, con lo zero dove l'altra non entra: il P&L del conto in
 * quella giornata è la somma dei due, zero compreso, quindi è la covarianza
 * che conta per il rischio del conto. I giorni in cui nessuna delle due opera
 * restano fuori: allungherebbero la serie e schiaccerebbero ogni valore verso
 * zero senza aggiungere informazione.
 *
 * Il CAMPIONE si misura invece sui giorni IN COMUNE, quelli in cui entrambe
 * hanno operato. Solo lì due strategie possono perdere o guadagnare insieme:
 * un giorno in cui una sola opera non dice nulla sul loro legame. Due
 * strategie che hanno 240 giorni di unione ma 20 in comune hanno venti
 * osservazioni del fenomeno, non 240 — ed è su quel numero che si decide se
 * il coefficiente si mostra.
 *
 * Coefficiente di Pearson. Se una delle due serie è piatta (deviazione
 * standard zero) la correlazione non è definita: `null`, mai uno zero che
 * si leggerebbe come "indipendenti".
 */

/**
 * Giorni IN COMUNE minimi perché la cella mostri un numero. Con 30
 * osservazioni l'errore standard di una correlazione nulla è ~0,18: un
 * coefficiente sotto ±0,36 non si distingue ancora da zero, e sotto 30 anche
 * valori grandi possono essere il caso. Soglia dichiarata in pagina.
 */
export const CORRELATION_MIN_DAYS = 30;

export interface CorrelationSeries {
  key: string;
  label: string;
  /** P&L per giornata: solo i giorni in cui questa serie ha operato. */
  byDay: Map<string, string>;
  /** Trade totali della serie nel periodo (per la riga di contesto). */
  trades: number;
}

export interface CorrelationPair {
  a: string;
  b: string;
  /** Pearson −1..1 a 4 decimali; null se non definito o campione corto. */
  r: string | null;
  /** Giorni in cui ENTRAMBE hanno operato: il campione della coppia. */
  commonDays: number;
  /** Giorni in cui almeno una delle due ha operato: il calendario del calcolo. */
  unionDays: number;
  /** true se i giorni in comune sono sotto la soglia: nessun coefficiente. */
  lowSample: boolean;
  /**
   * Ampiezza della banda di rumore attorno a zero, 1,96 / √giorni in comune
   * (scala 4). Un |r| dentro la banda non si distingue da zero. null sotto
   * campione.
   */
  noiseBand: string | null;
}

export interface CorrelationMatrix {
  keys: string[];
  labels: Record<string, string>;
  /** Chiave "a|b" con a<b in ordine di `keys`. */
  pairs: Map<string, CorrelationPair>;
}

function pearson(xs: Decimal[], ys: Decimal[]): string | null {
  const n = new Decimal(xs.length);
  if (xs.length < 2) return null;
  const meanX = xs.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);
  const meanY = ys.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);

  let cov = new Decimal(0);
  let varX = new Decimal(0);
  let varY = new Decimal(0);
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i].minus(meanX);
    const dy = ys[i].minus(meanY);
    cov = cov.plus(dx.times(dy));
    varX = varX.plus(dx.times(dx));
    varY = varY.plus(dy.times(dy));
  }
  if (varX.lte(0) || varY.lte(0)) return null;
  return cov.div(varX.sqrt().times(varY.sqrt())).toFixed(4);
}

/** Chiave canonica di una coppia, indipendente dall'ordine. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function correlationMatrix(
  series: CorrelationSeries[],
): CorrelationMatrix {
  const keys = series.map((s) => s.key);
  const labels = Object.fromEntries(series.map((s) => [s.key, s.label]));
  const pairs = new Map<string, CorrelationPair>();

  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const a = series[i];
      const b = series[j];
      const days = [...new Set([...a.byDay.keys(), ...b.byDay.keys()])].sort();
      const commonDays = days.filter((d) => a.byDay.has(d) && b.byDay.has(d)).length;
      const lowSample = commonDays < CORRELATION_MIN_DAYS;
      const xs = days.map((d) => new Decimal(a.byDay.get(d) ?? "0"));
      const ys = days.map((d) => new Decimal(b.byDay.get(d) ?? "0"));
      pairs.set(pairKey(a.key, b.key), {
        a: a.key,
        b: b.key,
        r: lowSample ? null : pearson(xs, ys),
        commonDays,
        unionDays: days.length,
        lowSample,
        noiseBand: lowSample
          ? null
          : new Decimal("1.96").div(new Decimal(commonDays).sqrt()).toFixed(4),
      });
    }
  }
  return { keys, labels, pairs };
}

/**
 * Serie che non possono avere NESSUNA coppia leggibile: meno giorni operati
 * della soglia, quindi meno giorni in comune con chiunque. Restano fuori dalla
 * matrice (sarebbero una riga di celle vuote) ma la pagina le nomina.
 */
export function correlationEligible(series: CorrelationSeries): boolean {
  return series.byDay.size >= CORRELATION_MIN_DAYS;
}

export type CorrelationTone =
  | "insieme-forte"
  | "insieme"
  | "rumore"
  | "opposte";

/**
 * Lettura in parole del coefficiente, CON IL SEGNO: +0,8 e −0,8 sono due
 * mondi opposti per chi diversifica (la prima moltiplica il rischio, la
 * seconda lo copre). Prima del segno viene il rumore: un valore dentro la
 * banda 1,96/√n non si legge né in un senso né nell'altro.
 */
export function correlationTone(pair: Pick<CorrelationPair, "r" | "noiseBand">): CorrelationTone | null {
  if (pair.r === null || pair.noiseBand === null) return null;
  const r = new Decimal(pair.r);
  if (r.abs().lt(pair.noiseBand)) return "rumore";
  if (r.lt(0)) return "opposte";
  return r.gte("0.6") ? "insieme-forte" : "insieme";
}

export const CORRELATION_TONE_LABELS: Record<CorrelationTone, string> = {
  "insieme-forte": "si muovono insieme, forte",
  insieme: "si muovono insieme",
  rumore: "non distinguibile da zero",
  opposte: "si compensano",
};

export const correlationInfo: MetricInfoData = {
  label: "Correlazione fra strategie",
  description:
    "Quanto si muovono insieme i P&L giornalieri di due strategie. Positiva e fuori dal rumore: vanno bene e male negli stessi giorni, e sommarle non riduce il rischio, lo moltiplica. Negativa: una copre l'altra. Dentro la banda di rumore: con i giorni che ci sono non si può dire. La cella resta vuota finché le due strategie non hanno operato insieme almeno 30 giorni: una correlazione su venti osservazioni è rumore che sembra un dato.",
  formula:
    "Pearson sui P&L giornalieri, zero nei giorni in cui una sola opera · campione = giorni in cui operano entrambe, minimo 30 · rumore = |r| < 1,96/√giorni in comune",
  note: "Correlazione non è causa: due strategie possono muoversi insieme perché reagiscono allo stesso mercato, non perché una dipenda dall'altra.",
};
