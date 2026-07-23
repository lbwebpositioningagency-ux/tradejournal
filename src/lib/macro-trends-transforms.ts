import type { FredObservation } from "@/lib/fred";

/**
 * Trasformazioni PURE per la pagina Trends (macro storico).
 *
 * Convenzioni:
 * - le osservazioni arrivano ordinate per data crescente, senza valori
 *   mancanti (il "." di FRED è già stato scartato dal parser) ma CON buchi
 *   di calendario possibili: ogni allineamento temporale cerca
 *   l'osservazione reale più vicina, MAI interpolazioni inventate;
 * - le percentuali sono in punti percentuali (3.5 = 3,5%);
 * - questi sono dati statistici di display (non denaro dell'utente):
 *   l'aritmetica float di `number` è adeguata, l'arrotondamento avviene
 *   solo in presentazione.
 */

export type SeriesTransform =
  | "level"
  | "yoy"
  | "mom_change"
  | "qoq_annualized"
  | "as_is";

export type SeriesCadence = "daily" | "weekly" | "monthly" | "quarterly";

export const HORIZONS = ["1A", "3A", "5A", "10A", "Max"] as const;
export type Horizon = (typeof HORIZONS)[number];

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" → giorni interi dall'epoca (UTC, niente fusi di mezzo). */
export function dateKeyToDays(dateKey: string): number {
  return (
    Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
    ) / DAY_MS
  );
}

/** Giorni epoca → "YYYY-MM-DD". */
export function daysToDateKey(days: number): string {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Indice dell'osservazione con data ≤ target più vicina al target;
 * -1 se tutte le osservazioni sono successive. Ricerca binaria.
 */
export function indexAtOrBefore(
  observations: FredObservation[],
  targetDays: number,
): number {
  let lo = 0;
  let hi = observations.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dateKeyToDays(observations[mid].date) <= targetDays) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * L'osservazione REALE più vicina al target (prima o dopo), entro
 * `toleranceDays`; null se nessuna rientra. Mai interpolare.
 */
export function nearestObservation(
  observations: FredObservation[],
  targetDays: number,
  toleranceDays: number,
): FredObservation | null {
  if (observations.length === 0) return null;
  const beforeIdx = indexAtOrBefore(observations, targetDays);
  const candidates: FredObservation[] = [];
  if (beforeIdx >= 0) candidates.push(observations[beforeIdx]);
  if (beforeIdx + 1 < observations.length) {
    candidates.push(observations[beforeIdx + 1]);
  }
  let best: FredObservation | null = null;
  let bestGap = Infinity;
  for (const candidate of candidates) {
    const gap = Math.abs(dateKeyToDays(candidate.date) - targetDays);
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best !== null && bestGap <= toleranceDays ? best : null;
}

/**
 * Variazione anno su anno in % — allineata all'osservazione reale più vicina
 * a −1 anno. Tolleranza stretta (15gg): meglio NESSUN punto che un "yoy" a
 * 11 mesi spacciato per annuale.
 */
export function yoy(
  observations: FredObservation[],
  toleranceDays = 15,
): FredObservation[] {
  const out: FredObservation[] = [];
  for (const obs of observations) {
    const target = dateKeyToDays(obs.date) - 365;
    const base = nearestObservation(observations, target, toleranceDays);
    if (!base || base.value === 0 || base.date === obs.date) continue;
    out.push({ date: obs.date, value: (obs.value / base.value - 1) * 100 });
  }
  return out;
}

/** Variazione sull'osservazione precedente (es. buste paga: Δ mensile). */
export function momChange(observations: FredObservation[]): FredObservation[] {
  const out: FredObservation[] = [];
  for (let i = 1; i < observations.length; i += 1) {
    out.push({
      date: observations[i].date,
      value: observations[i].value - observations[i - 1].value,
    });
  }
  return out;
}

/** Trimestre su trimestre ANNUALIZZATO in % (convenzione BEA: ^4). */
export function qoqAnnualized(
  observations: FredObservation[],
): FredObservation[] {
  const out: FredObservation[] = [];
  for (let i = 1; i < observations.length; i += 1) {
    const prev = observations[i - 1].value;
    if (prev <= 0) continue;
    out.push({
      date: observations[i].date,
      value: ((observations[i].value / prev) ** 4 - 1) * 100,
    });
  }
  return out;
}

export function applyTransform(
  observations: FredObservation[],
  transform: SeriesTransform,
): FredObservation[] {
  switch (transform) {
    case "yoy":
      return yoy(observations);
    case "mom_change":
      return momChange(observations);
    case "qoq_annualized":
      return qoqAnnualized(observations);
    case "level":
    case "as_is":
      return observations;
  }
}

/**
 * Percentile rank (0-100) dell'ULTIMO valore rispetto alla finestra degli
 * ultimi `windowYears` anni (ultimo incluso): quota di osservazioni della
 * finestra ≤ ultimo valore. null se la finestra ha meno di 20 osservazioni
 * (percentile su un pugno di punti = rumore).
 */
export function percentileRank(
  observations: FredObservation[],
  windowYears: number,
  minSamples = 20,
): number | null {
  if (observations.length === 0) return null;
  const last = observations[observations.length - 1];
  const fromDays = dateKeyToDays(last.date) - Math.round(windowYears * 365.25);
  const window = observations.filter(
    (o) => dateKeyToDays(o.date) >= fromDays,
  );
  if (window.length < minSamples) return null;
  const atOrBelow = window.filter((o) => o.value <= last.value).length;
  return Math.round((atOrBelow / window.length) * 100);
}

/** Finestra di osservazioni per l'orizzonte scelto (dall'ultima data, non da oggi). */
export function windowForHorizon(
  observations: FredObservation[],
  horizon: Horizon,
): FredObservation[] {
  if (horizon === "Max" || observations.length === 0) return observations;
  const years = { "1A": 1, "3A": 3, "5A": 5, "10A": 10 }[horizon];
  const lastDays = dateKeyToDays(observations[observations.length - 1].date);
  const fromDays = lastDays - Math.round(years * 365.25);
  const startIdx = indexAtOrBefore(observations, fromDays);
  // indexAtOrBefore dà l'ultimo ≤ from: la finestra parte dal successivo,
  // ma includiamo il punto al bordo se cade esattamente sulla data.
  const idx =
    startIdx >= 0 && dateKeyToDays(observations[startIdx].date) === fromDays
      ? startIdx
      : startIdx + 1;
  return observations.slice(Math.max(0, idx));
}

/**
 * Sfoltimento per il payload client: osservazioni REALI campionate a passo
 * crescente con l'età (recente = denso, remoto = rado). Prima e ultima
 * SEMPRE incluse. Nessun valore inventato: si scartano punti, non se ne
 * creano.
 *
 * Fasce (dall'ultima osservazione): ≤1 anno passo 1 · ≤3 anni ~2 ·
 * ≤10 anni ~1 punto/settimana di calendario · oltre ~1 punto/mese.
 * Per serie settimanali/mensili il passo effettivo non scende mai sotto 1.
 */
export function thinObservations(
  observations: FredObservation[],
  cadence: SeriesCadence,
): FredObservation[] {
  const n = observations.length;
  if (n <= 2) return observations;
  const lastDays = dateKeyToDays(observations[n - 1].date);
  const perDay = cadence === "daily" ? 1 : cadence === "weekly" ? 1 / 7 : 1 / 30;
  const strideFor = (ageDays: number): number => {
    if (ageDays <= 366) return 1;
    if (ageDays <= 3 * 366) return Math.max(1, Math.round(2 * perDay));
    if (ageDays <= 10 * 366) return Math.max(1, Math.round(7 * perDay));
    return Math.max(1, Math.round(30 * perDay));
  };
  const out: FredObservation[] = [];
  let i = 0;
  while (i < n - 1) {
    out.push(observations[i]);
    i += strideFor(lastDays - dateKeyToDays(observations[i].date));
  }
  out.push(observations[n - 1]);
  return out;
}

/**
 * Cadenza attesa → oltre questa età (giorni) la serie è "in ritardo".
 * Le soglie tengono conto dei LAG DI PUBBLICAZIONE normali: i mensili tipo
 * JOLTS escono con ~2 mesi di ritardo (data osservazione = inizio mese),
 * il PIL trimestrale con ~4 mesi dalla data di inizio trimestre.
 */
const STALE_AFTER_DAYS: Record<SeriesCadence, number> = {
  daily: 12,
  weekly: 25,
  monthly: 95,
  quarterly: 230,
};

export function isStale(
  lastDate: string,
  cadence: SeriesCadence,
  nowDays: number,
): boolean {
  return nowDays - dateKeyToDays(lastDate) > STALE_AFTER_DAYS[cadence];
}

/** Tolleranza di aggancio per la tabella di comparazione, per cadenza. */
const COMPARE_TOLERANCE_DAYS: Record<SeriesCadence, number> = {
  daily: 10,
  weekly: 15,
  monthly: 47,
  quarterly: 95,
};

export interface ComparisonPoint {
  value: number;
  date: string;
  /** Distanza in giorni dalla data richiesta (0 = esatta). */
  gapDays: number;
}

export interface ComparisonRow {
  now: ComparisonPoint | null;
  m1: ComparisonPoint | null;
  m3: ComparisonPoint | null;
  m6: ComparisonPoint | null;
  y1: ComparisonPoint | null;
  /** now − y1 (stesse unità della serie trasformata); null se manca un capo. */
  deltaY1: number | null;
}

/**
 * Fotografia numerica Ora · 1M · 3M · 6M · 1A fa: per ogni target si usa
 * l'osservazione reale più vicina entro la tolleranza della cadenza, con la
 * sua data e lo scarto (mai interpolare).
 */
export function comparisonRow(
  observations: FredObservation[],
  cadence: SeriesCadence,
): ComparisonRow {
  const empty: ComparisonRow = {
    now: null,
    m1: null,
    m3: null,
    m6: null,
    y1: null,
    deltaY1: null,
  };
  if (observations.length === 0) return empty;
  const last = observations[observations.length - 1];
  const lastDays = dateKeyToDays(last.date);
  const tolerance = COMPARE_TOLERANCE_DAYS[cadence];

  const at = (daysAgo: number): ComparisonPoint | null => {
    const target = lastDays - daysAgo;
    const obs = nearestObservation(observations, target, tolerance);
    if (!obs) return null;
    return {
      value: obs.value,
      date: obs.date,
      gapDays: Math.abs(dateKeyToDays(obs.date) - target),
    };
  };

  const now: ComparisonPoint = { value: last.value, date: last.date, gapDays: 0 };
  const y1 = at(365);
  return {
    now,
    m1: at(30),
    m3: at(91),
    m6: at(182),
    y1,
    deltaY1: y1 === null ? null : now.value - y1.value,
  };
}
