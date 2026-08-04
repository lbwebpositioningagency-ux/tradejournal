/**
 * Motore statistico del Driver Desk — modulo PURO, nessun I/O.
 * Implementa ESATTAMENTE le formule congelate in
 * docs/driver-desk/SPEC_driver_desk_v1.0.md §3: se un output sembra strano
 * si indaga il dato, non si ritocca la definizione.
 *
 * Convenzioni:
 * - il calendario di una scheda è l'INTERSEZIONE delle date (D5): mai
 *   forward-fill, mai interpolazione;
 * - "t−1" è la seduta precedente del calendario della scheda;
 * - σ campionaria con denominatore n−1; σ=0 o campione corto → statistica
 *   NON definita (null), mai un numero inventato;
 * - percentile con `<` stretto, giorno corrente escluso dal denominatore.
 */

export interface SeriesObs {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
}

/** Finestre del Blocco A (spec §3.1) e della variazione recente (§3.2). */
export const RS_WINDOWS = [20, 60] as const;
export const CHANGE_WINDOW = 20;
/** Finestra della correlazione rolling (spec §3.3). */
export const CORRELATION_WINDOW = 60;
/** Campione minimo perché z e percentile siano mostrati (spec §3.5). */
export const MIN_SAMPLE = 250;

/* ───────────────────────── Calendario (D5) ───────────────────────── */

export interface CalendarResult {
  /** Date (crescenti) presenti in TUTTE le serie. */
  dates: string[];
  /**
   * Per serie: osservazioni DENTRO la finestra comune [prima, ultima data]
   * che l'intersezione scarta. La storia precedente all'inizio comune non
   * conta: non è "persa", è fuori finestra per costruzione (D6) — contarla
   * gonfierebbe il numero e renderebbe la dichiarazione D5 fuorviante.
   */
  dropped: Record<string, number>;
}

/**
 * Intersezione delle date fra più serie: si tengono solo i giorni in cui
 * tutte hanno un dato. Documenta quante osservazioni perde ogni serie
 * dentro la finestra comune.
 */
export function intersectCalendar(
  series: Record<string, SeriesObs[]>,
): CalendarResult {
  const names = Object.keys(series);
  if (names.length === 0) return { dates: [], dropped: {} };

  const sets = names.map((n) => new Set(series[n].map((o) => o.date)));
  const common = [...sets[0]]
    .filter((d) => sets.every((s) => s.has(d)))
    .sort();

  const dropped: Record<string, number> = {};
  const commonSet = new Set(common);
  const start = common[0];
  const end = common[common.length - 1];
  for (const n of names) {
    dropped[n] =
      common.length === 0
        ? series[n].length
        : series[n].filter(
            (o) => o.date >= start && o.date <= end && !commonSet.has(o.date),
          ).length;
  }
  return { dates: common, dropped };
}

/** Valori di una serie allineati al calendario dato (che DEVE essere un
 * sottoinsieme delle sue date: l'intersezione lo garantisce). */
export function alignToCalendar(
  obs: SeriesObs[],
  dates: string[],
): number[] {
  const byDate = new Map(obs.map((o) => [o.date, o.value]));
  return dates.map((d) => {
    const v = byDate.get(d);
    if (v === undefined) {
      throw new Error(`alignToCalendar: data ${d} assente dalla serie`);
    }
    return v;
  });
}

/* ─────────────────────── Trasformazioni (§3.0) ─────────────────────── */

/**
 * Variazione giorno su giorno sul calendario della scheda: rendimento log
 * per i prezzi, differenza prima per tassi e spread. L'array risultante è
 * allineato a dates[1..]: la prima seduta non ha variazione (assenza, non
 * zero).
 */
export function dailyChanges(
  values: number[],
  transform: "logret" | "diff",
): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    out.push(
      transform === "logret"
        ? Math.log(values[i] / values[i - 1])
        : values[i] - values[i - 1],
    );
  }
  return out;
}

/* ─────────────────────── Statistiche di base ─────────────────────── */

export interface SampleStats {
  n: number;
  mean: number;
  /** Deviazione standard campionaria (n−1); null con n < 2 o σ = 0. */
  sd: number | null;
}

export function sampleStats(xs: number[]): SampleStats {
  const n = xs.length;
  if (n === 0) return { n: 0, mean: NaN, sd: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, sd: null };
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  return { n, mean, sd: sd > 0 ? sd : null };
}

/** z-score del valore corrente contro la storia; null se σ non definita. */
export function zScore(x: number, stats: SampleStats): number | null {
  if (stats.sd === null) return null;
  return (x - stats.mean) / stats.sd;
}

/**
 * Percentile con `<` STRETTO: quota delle osservazioni storiche sotto il
 * valore corrente (0-100). Il chiamante passa la storia SENZA il giorno
 * corrente (spec §3.1).
 */
export function percentileStrict(history: number[], x: number): number | null {
  if (history.length === 0) return null;
  let below = 0;
  for (const h of history) if (h < x) below += 1;
  return (100 * below) / history.length;
}

/* ─────────────────── Blocco A — forza nel paniere ─────────────────── */

/**
 * Somma mobile a W elementi. Risultato allineato all'input: indice i =
 * somma degli elementi [i−W+1 .. i]; null finché la finestra non è piena.
 */
export function rollingSum(xs: number[], w: number): (number | null)[] {
  const out: (number | null)[] = new Array(xs.length).fill(null);
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) {
    acc += xs[i];
    if (i >= w) acc -= xs[i - w];
    if (i >= w - 1) out[i] = acc;
  }
  return out;
}

/**
 * Serie storica della forza relativa RS_W (spec §3.1): rendimento cumulato
 * a W sedute dello strumento meno la MEDIA dei cumulati dei componenti del
 * paniere. Input: variazioni giornaliere (già trasformate) allineate fra
 * loro; output allineato all'input, null dove la finestra è incompleta.
 */
export function relativeStrengthSeries(
  mainChanges: number[],
  basketChanges: number[][],
  w: number,
): (number | null)[] {
  const mainCum = rollingSum(mainChanges, w);
  const basketCums = basketChanges.map((b) => rollingSum(b, w));
  return mainCum.map((m, i) => {
    if (m === null) return null;
    let sum = 0;
    for (const b of basketCums) {
      const v = b[i];
      if (v === null) return null;
      sum += v;
    }
    return m - sum / basketCums.length;
  });
}

/* ─────────────── Blocco C — correlazione rolling (§3.3) ─────────────── */

/**
 * Correlazione di Pearson sulle ultime W coppie, per ogni t. Risultato
 * allineato all'input; null finché non ci sono W coppie complete o quando
 * una delle due finestre ha varianza nulla.
 */
export function rollingCorrelation(
  xs: number[],
  ys: number[],
  w: number,
): (number | null)[] {
  if (xs.length !== ys.length) {
    throw new Error("rollingCorrelation: serie di lunghezza diversa");
  }
  const out: (number | null)[] = new Array(xs.length).fill(null);
  for (let t = w - 1; t < xs.length; t += 1) {
    let sx = 0;
    let sy = 0;
    for (let i = t - w + 1; i <= t; i += 1) {
      sx += xs[i];
      sy += ys[i];
    }
    const mx = sx / w;
    const my = sy / w;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = t - w + 1; i <= t; i += 1) {
      const dx = xs[i] - mx;
      const dy = ys[i] - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    if (sxx === 0 || syy === 0) continue; // varianza nulla: ρ non definita
    out[t] = sxy / Math.sqrt(sxx * syy);
  }
  return out;
}

/* ─────────── Indice cumulato standardizzato (grafico, R2) ─────────── */

/** Finestra del grafico di forza relativa: ultimi 12 mesi, fissa. */
export const CHART_WINDOW_DAYS = 365;

/**
 * Indice cumulato in UNITÀ COMPARABILI, per mettere sullo stesso asse serie
 * con unità diverse (dollari, punti indice, punti percentuali).
 *
 * Ogni variazione giornaliera viene divisa per la deviazione standard
 * STORICA della serie stessa — cioè misurata su tutta la storia comune della
 * scheda, non solo sulla finestra mostrata — e poi sommata progressivamente
 * partendo da 0. Una linea più in alto significa quindi «si è mosso meglio in
 * rapporto alla propria volatilità abituale», non «è salito di più in euro».
 *
 * NON si sottrae la media delle variazioni. La normalizzazione richiesta è
 * per la sola deviazione standard: togliere anche la deriva storica
 * trasformerebbe ogni linea nel residuo rispetto al proprio trend di lungo
 * periodo — un oggetto diverso, più difficile da spiegare in linguaggio piano
 * e capace di ribaltare l'ordine visivo delle linee. Restare sulla scala
 * grezza è la scelta conservativa: le linee dicono cosa è successo davvero,
 * solo riportato a una scala comune.
 *
 * Le serie restano SEMPRE distinte: non si sommano mai fra loro in un unico
 * indicatore (vincolo «niente compositi» della spec).
 *
 * Restituisce `windowChanges.length + 1` valori: il primo è 0, cioè l'inizio
 * della finestra.
 */
export function cumulativeStandardizedIndex(
  windowChanges: number[],
  sd: number,
): number[] {
  if (!(sd > 0)) {
    throw new Error("cumulativeStandardizedIndex: σ non positiva");
  }
  const out: number[] = [0];
  let acc = 0;
  for (const c of windowChanges) {
    acc += c / sd;
    out.push(acc);
  }
  return out;
}

/**
 * Indice della prima data che cade dentro la finestra di `days` giorni
 * CIVILI a ritroso dall'ultima data. Lavora sulle stringhe ISO: il confronto
 * lessicografico su "YYYY-MM-DD" è già cronologico.
 */
export function windowStartIndex(dates: string[], days: number): number {
  if (dates.length === 0) return 0;
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - days);
  const cutoff = end.toISOString().slice(0, 10);
  const i = dates.findIndex((d) => d >= cutoff);
  return i === -1 ? dates.length - 1 : i;
}

/* ──────────────────── Bande verbali (§3.4) ──────────────────── */

export type DriverBanda =
  | "MOLTO BASSO"
  | "BASSO"
  | "NELLA NORMA"
  | "ALTO"
  | "MOLTO ALTO";

/** Stesse soglie del pannello COT: 10 / 30 / 70 / 90. */
export function bandFromPercentile(p: number): DriverBanda {
  if (p < 10) return "MOLTO BASSO";
  if (p < 30) return "BASSO";
  if (p < 70) return "NELLA NORMA";
  if (p < 90) return "ALTO";
  return "MOLTO ALTO";
}

/* ──────────── Statistica corrente contro la propria storia ──────────── */

export interface CurrentVsHistory {
  /** Valore corrente della statistica. */
  value: number;
  /** z contro TUTTA la storia comune, giorno corrente incluso (spec §3.1). */
  z: number | null;
  /** Percentile 0-100 (storia SENZA il giorno corrente, `<` stretto). */
  percentile: number | null;
  /** Osservazioni storiche nel denominatore del percentile. */
  n: number;
}

/**
 * Confronta l'ULTIMO valore non-null di una serie storica di statistiche con
 * la propria distribuzione. Come da spec congelata: μ e σ dello z si stimano
 * su TUTTA la storia (giorno corrente incluso); il percentile conta con `<`
 * stretto le sole osservazioni PRECEDENTI. Sotto MIN_SAMPLE osservazioni
 * storiche, z e percentile restano null (campione insufficiente, dichiarato
 * in UI).
 */
export function currentVsHistory(
  series: (number | null)[],
): CurrentVsHistory | null {
  let lastIdx = -1;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i] !== null) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx === -1) return null;
  const value = series[lastIdx] as number;
  const history: number[] = [];
  for (let i = 0; i < lastIdx; i += 1) {
    const v = series[i];
    if (v !== null) history.push(v);
  }
  if (history.length < MIN_SAMPLE) {
    return { value, z: null, percentile: null, n: history.length };
  }
  const stats = sampleStats([...history, value]);
  return {
    value,
    z: zScore(value, stats),
    percentile: percentileStrict(history, value),
    n: history.length,
  };
}
