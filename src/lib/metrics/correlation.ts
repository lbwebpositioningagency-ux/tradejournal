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
 * CALENDARIO COMUNE, con lo zero dove non si è operato. Una strategia che un
 * giorno non entra contribuisce zero a quella giornata: è un fatto, non un
 * dato mancante, e toglierlo cambierebbe la domanda in «quando entrano
 * entrambe, si somigliano?», che è un'altra cosa. Il calendario comune è
 * l'insieme dei giorni in cui ALMENO UNA delle due ha operato: i giorni in
 * cui nessuna delle due ha fatto nulla non sono informazione, e tenerli
 * schiaccerebbe ogni correlazione verso zero solo allungando la serie.
 *
 * Coefficiente di Pearson. Se una delle due serie è piatta (deviazione
 * standard zero) la correlazione non è definita: `null`, mai uno zero che
 * si leggerebbe come "indipendenti".
 */

/**
 * Giornate comuni minime perché una correlazione sia leggibile. Sotto, il
 * coefficiente esiste ma il suo errore standard è dell'ordine del
 * coefficiente stesso: sarebbe un numero che descrive il caso.
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
  /** Giornate del calendario comune usate. */
  days: number;
  /** true se il campione è sotto la soglia: il valore non viene calcolato. */
  lowSample: boolean;
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
      // Calendario comune: i giorni in cui almeno una delle due ha operato.
      const days = [...new Set([...a.byDay.keys(), ...b.byDay.keys()])].sort();
      const xs = days.map((d) => new Decimal(a.byDay.get(d) ?? "0"));
      const ys = days.map((d) => new Decimal(b.byDay.get(d) ?? "0"));
      const lowSample = days.length < CORRELATION_MIN_DAYS;
      pairs.set(pairKey(a.key, b.key), {
        a: a.key,
        b: b.key,
        r: lowSample ? null : pearson(xs, ys),
        days: days.length,
        lowSample,
      });
    }
  }
  return { keys, labels, pairs };
}

/**
 * Lettura in parole del coefficiente. Le soglie sono convenzionali e
 * dichiarate: servono a evitare che 0,31 e 0,29 sembrino due mondi.
 */
export function correlationTone(
  r: string | null,
): "alta" | "media" | "bassa" | null {
  if (r === null) return null;
  const abs = new Decimal(r).abs();
  if (abs.gte("0.6")) return "alta";
  if (abs.gte("0.3")) return "media";
  return "bassa";
}

export const correlationInfo: MetricInfoData = {
  label: "Correlazione fra strategie",
  description:
    "Quanto si muovono insieme i P&L giornalieri di due strategie. Vicino a +1 vanno bene e male negli stessi giorni: sommarle non riduce il rischio, lo raddoppia. Vicino a 0 si alternano, ed è lì che la diversificazione fa il suo lavoro. Sotto zero una copre l'altra. È l'unica lettura che guarda le strategie INSIEME invece che una riga alla volta: due strategie ottime che perdono lo stesso giorno fanno un conto peggiore di due mediocri che si alternano.",
  formula:
    "Pearson sui P&L giornalieri · calendario comune (0 nei giorni in cui una non opera) · minimo 30 giornate comuni",
  note: "Correlazione non è causa: due strategie possono muoversi insieme perché reagiscono allo stesso mercato, non perché una dipenda dall'altra.",
};
