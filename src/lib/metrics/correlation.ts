import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * CORRELAZIONE FRA STRATEGIE sui P&L AGGREGATI PER SETTIMANA O PER MESE.
 *
 * La domanda è «sto davvero diversificando, o le mie strategie perdono tutte
 * negli stessi periodi?». Nessuna metrica per-strategia la risolve: profit
 * factor ed expectancy guardano una riga alla volta.
 *
 * SUI RENDIMENTI, NON SUI PREZZI: correlare le settimane del proprio trading
 * dice qualcosa sul proprio trading, l'unica cosa su cui si può agire.
 *
 * PERCHÉ NON PIÙ I GIORNI (16/09/2026). Due strategie discrezionali operano
 * insieme in pochi giorni: su SIM1 le coppie avevano 28-46 giorni in comune su
 * 19 mesi, e il coefficiente poggiava su troppo poco. Una settimana o un mese
 * raccolgono più trade di entrambe, e il legame fra le due ha il tempo di
 * manifestarsi anche quando non operano lo stesso giorno.
 *
 * DEFINIZIONE DEI PERIODI (tutto sul giorno di CHIUSURA nel fuso dell'utente,
 * come ogni bucket giornaliero dell'app):
 * - SETTIMANA di calendario, da lunedì. Le sedute sono i cinque giorni
 *   lunedì–venerdì; un trade chiuso di sabato o domenica resta nella settimana
 *   di quel lunedì (non ne crea una nuova).
 * - MESE di calendario.
 * - PERIODI PARZIALI: entra solo un periodo le cui sedute cadono TUTTE dentro
 *   l'intervallo selezionato — per la settimana lunedì e venerdì, per il mese
 *   il primo e l'ultimo giorno. Un periodo tagliato dal filtro (o non ancora
 *   finito) somma meno sedute degli altri e confronterebbe grandezze diverse:
 *   resta fuori e la pagina dice quanti ne ha tolti. Senza data d'inizio
 *   («tutto lo storico») il primo periodo non è tagliato da nessun filtro.
 *
 * PERIODI SENZA ATTIVITÀ: ESCLUSI. Il coefficiente si calcola SOLO sui periodi
 * in cui entrambe le strategie hanno operato. Uno zero messo dove una
 * strategia è ferma non è un risultato, è un'assenza: con i periodi di
 * calendario due strategie ferme insieme finirebbero allineate sullo zero, e
 * anche lo zero di una sola lega il coefficiente a QUANDO si opera invece che
 * a COME va. Escludendoli, il numero di osservazioni del coefficiente è lo
 * stesso della soglia e della banda di rumore: il test dichiarato è quello
 * che si fa davvero.
 *
 * Coefficiente di Pearson. Se una delle due serie è piatta la correlazione
 * non è definita: `null`, mai uno zero che si leggerebbe «indipendenti».
 */

export type CorrelationGrain = "week" | "month";

export const CORRELATION_GRAINS: readonly { key: CorrelationGrain; label: string }[] = [
  { key: "week", label: "Settimana" },
  { key: "month", label: "Mese" },
];

export const DEFAULT_CORRELATION_GRAIN: CorrelationGrain = "week";

/** Parole del periodo, per celle, meta e metodo. */
export const CORRELATION_UNITS: Record<
  CorrelationGrain,
  { one: string; many: string; short: string }
> = {
  week: { one: "settimana", many: "settimane", short: "sett." },
  month: { one: "mese", many: "mesi", short: "mesi" },
};

/**
 * Osservazioni IN COMUNE minime perché una coppia mostri un numero, per
 * periodo. Sono uguali, e non per pigrizia: l'incertezza di un coefficiente
 * dipende dal NUMERO di coppie di osservazioni, non da quanto dura ognuna.
 * Con n osservazioni una correlazione nulla oscilla di ±1,96/√n; a 30 la banda
 * è ±0,36, ed è anche il campione che distingue da zero una correlazione vera
 * di 0,5 con probabilità dell'80% (Fisher: ((1,96+0,84)/atanh 0,5)² + 3 ≈ 29).
 * Sotto 30 anche un valore grande può essere il caso.
 *
 * Dividere la vecchia soglia per la lunghezza del periodo (30 giorni → 6
 * settimane, 1,5 mesi) darebbe coefficienti su sei punti: bande di ±0,80, il
 * rumore scambiato per dato. Per il mese 30 osservazioni sono due anni e
 * mezzo di operatività congiunta: è il prezzo di una domanda sul mese, e
 * uno storico più corto la dichiara non calcolabile.
 */
export const CORRELATION_MIN_OBSERVATIONS: Record<CorrelationGrain, number> = {
  week: 30,
  month: 30,
};

const DAY_MS = 86_400_000;

function dayToUtc(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00Z`);
}

function utcToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Chiave del periodo di un giorno "YYYY-MM-DD": lunedì della settimana o "YYYY-MM". */
export function correlationPeriodKey(day: string, grain: CorrelationGrain): string {
  if (grain === "month") return day.slice(0, 7);
  const date = dayToUtc(day);
  const offset = (date.getUTCDay() + 6) % 7; // lunedì = 0
  return utcToDay(new Date(date.getTime() - offset * DAY_MS));
}

/** Prima e ultima seduta del periodo: lunedì–venerdì, o primo–ultimo del mese. */
export function correlationPeriodBounds(
  key: string,
  grain: CorrelationGrain,
): { first: string; last: string } {
  if (grain === "week") {
    return { first: key, last: utcToDay(new Date(dayToUtc(key).getTime() + 4 * DAY_MS)) };
  }
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first: `${key}-01`, last: `${key}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * true se tutte le sedute del periodo cadono nell'intervallo [fromKey, toKey]
 * (giorni locali, estremi inclusi). Senza `fromKey` l'inizio non taglia.
 */
export function isCompletePeriod(
  key: string,
  grain: CorrelationGrain,
  range: { fromKey?: string; toKey: string },
): boolean {
  const { first, last } = correlationPeriodBounds(key, grain);
  if (range.fromKey !== undefined && first < range.fromKey) return false;
  return last <= range.toKey;
}

export interface StrategyDayRow {
  strategyId: string;
  strategyName: string;
  /** "YYYY-MM-DD" nel fuso dell'utente. */
  day: string;
  netPnl: string;
  trades: number;
}

export interface CorrelationSeries {
  key: string;
  label: string;
  /** P&L per periodo completo: solo i periodi in cui questa serie ha operato. */
  byPeriod: Map<string, string>;
  /** Trade della serie nei periodi completi. */
  trades: number;
}

export interface AggregatedSeries {
  series: CorrelationSeries[];
  /** Periodi con trade tolti perché tagliati dall'intervallo. */
  partialPeriods: number;
  /** Periodi completi con almeno un trade di almeno una strategia. */
  periods: number;
}

/**
 * Dalle righe giornaliere (già aggregate in SQL per strategia e giorno) alle
 * serie per periodo. Somme in Decimal; i periodi parziali restano fuori.
 */
export function aggregateStrategySeries(
  rows: StrategyDayRow[],
  grain: CorrelationGrain,
  range: { fromKey?: string; toKey: string },
): AggregatedSeries {
  const byStrategy = new Map<
    string,
    { key: string; label: string; sums: Map<string, Decimal>; trades: number }
  >();
  const partial = new Set<string>();
  const complete = new Set<string>();
  for (const row of rows) {
    const period = correlationPeriodKey(row.day, grain);
    if (!isCompletePeriod(period, grain, range)) {
      partial.add(period);
      continue;
    }
    complete.add(period);
    const entry = byStrategy.get(row.strategyId) ?? {
      key: row.strategyId,
      label: row.strategyName,
      sums: new Map<string, Decimal>(),
      trades: 0,
    };
    entry.sums.set(period, (entry.sums.get(period) ?? new Decimal(0)).plus(row.netPnl));
    entry.trades += row.trades;
    byStrategy.set(row.strategyId, entry);
  }
  const series = [...byStrategy.values()]
    .map((s) => ({
      key: s.key,
      label: s.label,
      trades: s.trades,
      byPeriod: new Map([...s.sums].map(([k, v]) => [k, v.toFixed(2)])),
    }))
    .sort((a, b) => b.trades - a.trades);
  return { series, partialPeriods: partial.size, periods: complete.size };
}

export interface CorrelationPair {
  a: string;
  b: string;
  /** Pearson −1..1 a 4 decimali; null se non definito o campione corto. */
  r: string | null;
  /** Periodi in cui ENTRAMBE hanno operato: campione E calendario del calcolo. */
  common: number;
  /** Periodi in cui ha operato una sola delle due: esclusi dal calcolo. */
  onlyOne: number;
  /** true se i periodi in comune sono sotto la soglia: nessun coefficiente. */
  lowSample: boolean;
  /**
   * Banda di rumore attorno a zero, 1,96 / √periodi in comune (scala 4). Un |r|
   * dentro la banda non si distingue da zero. null sotto campione.
   */
  noiseBand: string | null;
}

export interface CorrelationMatrix {
  grain: CorrelationGrain;
  keys: string[];
  labels: Record<string, string>;
  /** Chiave "a|b" canonica (vedi `pairKey`). */
  pairs: Map<string, CorrelationPair>;
}

/** Pearson su due serie della stessa lunghezza; null se < 2 punti o una è piatta. */
export function pearson(xs: Decimal[], ys: Decimal[]): string | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const n = new Decimal(xs.length);
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
  grain: CorrelationGrain,
): CorrelationMatrix {
  const min = CORRELATION_MIN_OBSERVATIONS[grain];
  const keys = series.map((s) => s.key);
  const labels = Object.fromEntries(series.map((s) => [s.key, s.label]));
  const pairs = new Map<string, CorrelationPair>();

  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const a = series[i];
      const b = series[j];
      const common = [...a.byPeriod.keys()].filter((p) => b.byPeriod.has(p)).sort();
      const union = new Set([...a.byPeriod.keys(), ...b.byPeriod.keys()]).size;
      const lowSample = common.length < min;
      pairs.set(pairKey(a.key, b.key), {
        a: a.key,
        b: b.key,
        r: lowSample
          ? null
          : pearson(
              common.map((p) => new Decimal(a.byPeriod.get(p)!)),
              common.map((p) => new Decimal(b.byPeriod.get(p)!)),
            ),
        common: common.length,
        onlyOne: union - common.length,
        lowSample,
        noiseBand: lowSample
          ? null
          : new Decimal("1.96").div(new Decimal(common.length).sqrt()).toFixed(4),
      });
    }
  }
  return { grain, keys, labels, pairs };
}

/**
 * Serie che non possono avere NESSUNA coppia leggibile: meno periodi operati
 * della soglia, quindi meno periodi in comune con chiunque. Restano fuori
 * dalla matrice (sarebbero una riga di celle vuote) ma la pagina le nomina.
 */
export function correlationEligible(
  series: CorrelationSeries,
  grain: CorrelationGrain,
): boolean {
  return series.byPeriod.size >= CORRELATION_MIN_OBSERVATIONS[grain];
}

export interface CorrelationAvailability {
  /** true se almeno una coppia supera la soglia. */
  usable: boolean;
  /** La coppia con più periodi in comune (anche sotto soglia); null con < 2 strategie. */
  closest: CorrelationPair | null;
}

/**
 * Il periodo è calcolabile? Si guarda la matrice di TUTTE le strategie, non
 * solo delle eleggibili: quando nessuna coppia arriva alla soglia la pagina
 * dice quanto manca alla coppia più vicina.
 */
export function correlationAvailability(all: CorrelationMatrix): CorrelationAvailability {
  let closest: CorrelationPair | null = null;
  let usable = false;
  for (const pair of all.pairs.values()) {
    if (!pair.lowSample) usable = true;
    if (closest === null || pair.common > closest.common) closest = pair;
  }
  return { usable, closest };
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
    "Quanto si muovono insieme i P&L di due strategie, sommati per settimana o per mese. Positiva e fuori dal rumore: vanno bene e male negli stessi periodi, e sommarle non riduce il rischio, lo moltiplica. Negativa: una copre l'altra. Dentro la banda di rumore: con i periodi che ci sono non si può dire. La cella resta vuota finché le due strategie non hanno operato insieme almeno 30 settimane (o 30 mesi): una correlazione su dieci osservazioni è rumore che sembra un dato.",
  formula:
    "Pearson sui P&L per settimana (lun–ven) o per mese di calendario, solo nei periodi in cui operano entrambe · minimo 30 periodi in comune · rumore = |r| < 1,96/√periodi in comune",
  note: "Correlazione non è causa: due strategie possono muoversi insieme perché reagiscono allo stesso mercato, non perché una dipenda dall'altra.",
};
