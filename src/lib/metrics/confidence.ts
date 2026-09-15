import Decimal from "decimal.js";
import { mulberry32 } from "./monte-carlo";
import type { MetricInfoData } from "./types";

/**
 * INTERVALLI DI CONFIDENZA — quanto è sicura una stima, e quanti trade
 * servirebbero perché dica qualcosa.
 *
 * Un win rate del 55% su 20 trade e uno su 600 si scrivono uguali e non
 * valgono lo stesso: il primo sta fra il 34% e il 74%, il secondo fra il 51% e
 * il 59%. Senza l'intervallo la tabella invita a scegliere fra righe che non
 * si distinguono.
 *
 * - WIN RATE: intervallo di Wilson al 95%. A differenza dell'approssimazione
 *   normale non esce da [0,1] e regge con pochi trade e tassi estremi.
 * - EXPECTANCY (in R e in valuta): bootstrap a BLOCCHI mobili, percentili
 *   2,5–97,5. I trade di un conto non sono indipendenti — le serie esistono —
 *   e ricampionare trade singoli restringerebbe l'intervallo più del dovuto:
 *   i blocchi di trade consecutivi (lunghezza ⌈n^⅓⌉, circolari) conservano
 *   quella dipendenza.
 *
 * ARITMETICA: il bootstrap lavora su interi in unità minime (centesimi, 1/10.000
 * di R) che arrivano già arrotondati dal database. Una somma di interi è
 * esatta in un Number JS fino a 2^53, quindi il ricampionamento non introduce
 * errori di virgola mobile; i confini tornano Decimal con una sola divisione.
 * Seme fisso: la stessa pagina ricaricata mostra lo stesso intervallo.
 *
 * CAMPIONE: sotto 30 trade per gruppo nessun intervallo, nessuna elezione
 * (`ESTIMATE_MIN_TRADES`, la stessa soglia degli estremi).
 */

export const CONFIDENCE_Z = new Decimal("1.96");
export const ESTIMATE_MIN_TRADES = 30;
export const BOOTSTRAP_RESAMPLES = 1000;
const BOOTSTRAP_SEED = 20260915;

export interface Interval {
  /** Estremo inferiore (stessa unità della stima). */
  lower: string;
  upper: string;
}

/** Wilson al 95% per `successes` su `n`. null senza prove. Frazioni a 4 decimali. */
export function wilsonInterval(successes: number, n: number): Interval | null {
  if (n <= 0) return null;
  const z = CONFIDENCE_Z;
  const z2 = z.pow(2);
  const nD = new Decimal(n);
  const p = new Decimal(successes).div(nD);
  const denom = new Decimal(1).plus(z2.div(nD));
  const center = p.plus(z2.div(nD.times(2))).div(denom);
  const half = z
    .times(p.times(new Decimal(1).minus(p)).div(nD).plus(z2.div(nD.pow(2).times(4))).sqrt())
    .div(denom);
  return {
    lower: Decimal.max(0, center.minus(half)).toFixed(4),
    upper: Decimal.min(1, center.plus(half)).toFixed(4),
  };
}

/**
 * Intervallo bootstrap a blocchi mobili della MEDIA di una serie di interi
 * (unità minime), nell'ordine cronologico dei trade. `scale` riporta
 * all'unità della stima (100 per i centesimi). null sotto i 2 valori.
 */
export function blockBootstrapMeanInterval(
  units: readonly number[],
  scale: number,
  options: { resamples?: number; seed?: number } = {},
): Interval | null {
  const n = units.length;
  if (n < 2) return null;
  const resamples = options.resamples ?? BOOTSTRAP_RESAMPLES;
  const random = mulberry32(options.seed ?? BOOTSTRAP_SEED);
  const block = Math.max(1, Math.round(Math.cbrt(n)));
  const sums: number[] = new Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let sum = 0;
    let taken = 0;
    while (taken < n) {
      const start = Math.floor(random() * n);
      for (let k = 0; k < block && taken < n; k++, taken++) {
        sum += units[(start + k) % n];
      }
    }
    sums[b] = sum;
  }
  sums.sort((a, b) => a - b);
  const lo = sums[Math.floor(0.025 * (resamples - 1))];
  const hi = sums[Math.ceil(0.975 * (resamples - 1))];
  const toUnit = (sum: number) => new Decimal(sum).div(n).div(scale);
  return { lower: toUnit(lo).toFixed(4), upper: toUnit(hi).toFixed(4) };
}

/** Media e deviazione standard campionaria (Decimal) di interi in unità minime. */
function meanAndSd(units: readonly number[], scale: number) {
  const n = units.length;
  const values = units.map((u) => new Decimal(u).div(scale));
  const mean = values.reduce((a, v) => a.plus(v), new Decimal(0)).div(n);
  const variance =
    n > 1
      ? values.reduce((a, v) => a.plus(v.minus(mean).pow(2)), new Decimal(0)).div(n - 1)
      : new Decimal(0);
  return { mean, sd: variance.sqrt() };
}

/**
 * Trade necessari perché una media si distingua da zero con questa
 * dispersione: n ≈ (1,96 · σ / |media|)². null se la media è zero (non si
 * distinguerà mai) o se la serie è piatta. È un ordine di grandezza sotto
 * l'ipotesi normale, non una promessa: con trade dipendenti ne servono di più.
 */
export function tradesToDistinguishMean(mean: Decimal, sd: Decimal): number | null {
  if (mean.isZero()) return null;
  if (sd.isZero()) return 2;
  return Math.max(2, CONFIDENCE_Z.times(sd).div(mean.abs()).pow(2).ceil().toNumber());
}

/**
 * Trade necessari perché un win rate `p` si distingua dalla soglia `ref`
 * (il win rate di pareggio): n ≈ 1,96² · p(1−p) / (p − ref)².
 */
export function tradesToDistinguishRate(p: Decimal, ref: Decimal): number | null {
  const gap = p.minus(ref);
  if (gap.isZero()) return null;
  const variance = p.times(new Decimal(1).minus(p));
  if (variance.isZero()) return 2;
  return Math.max(2, CONFIDENCE_Z.pow(2).times(variance).div(gap.pow(2)).ceil().toNumber());
}

export interface Estimate {
  /** Stima puntuale; null sotto campione o non definita. */
  value: string | null;
  interval: Interval | null;
  /** Trade su cui la stima è calcolata. */
  n: number;
  /** true = sotto `ESTIMATE_MIN_TRADES`: nessuna stima, nessun intervallo. */
  lowSample: boolean;
  /**
   * L'intervallo esclude il riferimento (zero, o il win rate di pareggio).
   * null se non c'è intervallo o non c'è riferimento.
   */
  distinct: boolean | null;
  /** Trade stimati per distinguersi dal riferimento; null = non raggiungibile. */
  tradesNeeded: number | null;
  /** Il valore di riferimento usato (0, o la soglia di pareggio). */
  reference: string | null;
}

const excludes = (interval: Interval, ref: Decimal) =>
  new Decimal(interval.lower).gt(ref) || new Decimal(interval.upper).lt(ref);

/** Expectancy (media) con intervallo bootstrap, contro lo zero. */
export function meanEstimate(units: readonly number[], scale: number): Estimate {
  const n = units.length;
  if (n < ESTIMATE_MIN_TRADES) {
    return { value: null, interval: null, n, lowSample: true, distinct: null, tradesNeeded: null, reference: "0" };
  }
  const { mean, sd } = meanAndSd(units, scale);
  const interval = blockBootstrapMeanInterval(units, scale);
  return {
    value: mean.toFixed(4),
    interval,
    n,
    lowSample: false,
    distinct: interval ? excludes(interval, new Decimal(0)) : null,
    tradesNeeded: tradesToDistinguishMean(mean, sd),
    reference: "0",
  };
}

/**
 * Win rate (vincenti su tutti i trade, breakeven nel denominatore come nel
 * resto dell'app) con Wilson, contro il win rate di pareggio del gruppo —
 * distinguere un win rate «da zero» non significa nulla.
 */
export function winRateEstimate(
  wins: number,
  total: number,
  breakEven: string | null,
): Estimate {
  if (total < ESTIMATE_MIN_TRADES) {
    return { value: null, interval: null, n: total, lowSample: true, distinct: null, tradesNeeded: null, reference: breakEven };
  }
  const p = new Decimal(wins).div(total);
  const interval = wilsonInterval(wins, total);
  const ref = breakEven === null ? null : new Decimal(breakEven);
  return {
    value: p.toFixed(4),
    interval,
    n: total,
    lowSample: false,
    distinct: interval && ref ? excludes(interval, ref) : null,
    tradesNeeded: ref ? tradesToDistinguishRate(p, ref) : null,
    reference: breakEven,
  };
}

/** Due intervalli non si toccano: il superiore dell'uno sta sotto l'inferiore dell'altro. */
export function intervalsDisjoint(a: Interval | null, b: Interval | null): boolean {
  if (!a || !b) return false;
  return new Decimal(a.lower).gt(b.upper) || new Decimal(b.lower).gt(a.upper);
}

/**
 * Serie di unità minime dal testo del database (`{"123","-45"}` o array di
 * stringhe). Gli interi arrivano già arrotondati in SQL: `Number` qui legge un
 * intero, non fa aritmetica decimale.
 */
export function parseUnits(series: readonly string[] | null | undefined): number[] {
  if (!series) return [];
  return series.map((s) => Number.parseInt(s, 10)).filter((v) => Number.isSafeInteger(v));
}

export const confidenceInfo: MetricInfoData = {
  label: "Intervallo al 95%",
  description:
    "L'intervallo dentro cui cade il valore vero con una confidenza del 95%, dati i trade che ci sono. Più è largo, meno la stima dice: due righe con intervalli sovrapposti non si distinguono, anche se i numeri sembrano diversi. Accanto, quanti trade servirebbero perché la stima si separi dal riferimento (zero per l'expectancy, il win rate di pareggio per il win rate). Sotto 30 trade nessun intervallo: sarebbe largo quasi quanto tutto il possibile.",
  formula:
    "Win rate: Wilson, z = 1,96 · Expectancy: bootstrap a blocchi mobili (⌈n^⅓⌉ trade consecutivi, 1.000 ricampionamenti, percentili 2,5–97,5) · trade necessari ≈ (1,96·σ/|media|)²",
  note: "Assume che il futuro somigli al campione. Non corregge per i confronti multipli: su venti righe, una fuori dall'intervallo per caso è attesa.",
};
