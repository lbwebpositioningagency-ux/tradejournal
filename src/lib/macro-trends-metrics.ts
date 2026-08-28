import type { FredObservation } from "@/lib/fred";
import type { DeltaMode, GoodDirection } from "@/lib/macro-trends-series";
import {
  dateKeyToDays,
  nearestObservation,
  percentileRank,
  type SeriesCadence,
} from "@/lib/macro-trends-transforms";

/**
 * Layer calcolato della pagina Trends (FASE 29): trend, variazioni di
 * periodo, percentile storico e posizione del livello. Modulo PURO: lavora
 * sulla serie GIÀ trasformata e già scaricata (orizzonte Max) — nessuna
 * chiamata FRED, nessuna interpolazione, aritmetica float da display.
 *
 * Onestà statistica:
 * - percentile e livello sono calcolati sulla finestra di regime
 *   (CYCLE_LEVEL_YEARS anni), con fallback dichiarato alla storia intera
 *   per le serie corte; la UI dichiara l'anno di partenza;
 * - meno di MIN_HISTORY_SAMPLES osservazioni = metrica assente, mai un
 *   numero su un pugno di punti;
 * - i valori sono gli ultimi RIVISTI pubblicati da FRED (default dell'API,
 *   niente vintage ALFRED).
 */

export type TrendLabel = "rialzista" | "ribassista" | "laterale";

export interface PeriodChange {
  /** "MoM" · "YoY" · "QoQ" · "1S" · "1M" (dalla cadenza della serie). */
  label: string;
  /** Delta nelle unità della serie (pct=false) o in % (pct=true); null se non calcolabile. */
  value: number | null;
  pct: boolean;
}

export interface SeriesMetrics {
  trend: TrendLabel | null;
  /**
   * Q-03 — pendenza (ultime 6 oss.) / sd DELLA PENDENZA sotto rumore
   * (σ recente × slopeNoiseFactor): ~N(0,1) su una passeggiata aleatoria.
   */
  trendZ: number | null;
  changes: PeriodChange[];
  /**
   * Q-04 — percentile (0-100) dell'ultimo valore sulla finestra di
   * CYCLE_LEVEL_YEARS anni; fallback dichiarato alla storia intera se la
   * finestra non ha abbastanza campioni.
   */
  percentile: number | null;
  /** Anno della prima osservazione: il "dal ..." dichiarato in UI. */
  historyStartYear: string | null;
  /**
   * Q-04 — z-score dell'ultimo livello vs finestra di CYCLE_LEVEL_YEARS
   * anni; fallback alla storia intera se corta.
   */
  levelZ: number | null;
}

/** Finestra della regressione del trend (spec: ultime 6 osservazioni). */
export const TREND_WINDOW = 6;
/**
 * Q-03 — |z| sotto la soglia = laterale. Con la normalizzazione corretta
 * (vedi `slopeNoiseFactor`) z è ~N(0,1) sotto una passeggiata aleatoria
 * senza trend: la soglia 1,645 è il quantile 95% della normale, quindi il
 * tasso di falsi trend su puro rumore è ~10% (5% per coda). La vecchia
 * soglia 0,5 applicata a una z NON normalizzata per la varianza dello
 * stimatore produceva ~28% di falsi trend.
 */
export const TREND_Z_THRESHOLD = 1.645;
/**
 * Q-03 — la dev. std. delle variazioni si stima sugli ultimi 5 anni, non
 * sull'intera storia: la sd full-history mescola regimi di volatilità (la
 * sd del MoM CPI include il 2021-22) e schiaccia sistematicamente i trend
 * recenti su "laterale". Fallback dichiarato alla storia intera quando la
 * finestra non raggiunge MIN_HISTORY_SAMPLES variazioni.
 */
export const TREND_SD_YEARS = 5;
/** Q-04 — finestra del livello: 10 anni è lo standard di lettura. */
export const CYCLE_LEVEL_YEARS = 10;
/** Sotto questo numero di campioni le statistiche non si calcolano. */
export const MIN_HISTORY_SAMPLES = 20;

/**
 * Q-03 — deviazione standard della pendenza OLS su una passeggiata
 * aleatoria, in unità della sd σ del singolo passo. Forma chiusa:
 *
 *   slope = Σᵢ wᵢ·yᵢ   con  wᵢ = (i − x̄)/D,  D = Σᵢ (i − x̄)²
 *   yᵢ = y₀ + Σ_{k≤i} eₖ  (Σwᵢ = 0 ⇒ y₀ sparisce)
 *   ⇒ slope = Σ_{k=1}^{n−1} cₖ·eₖ   con  cₖ = Σ_{i≥k} wᵢ
 *   ⇒ sd(slope) = σ·√(Σ cₖ²)
 *
 * Per n = 6: D = 17,5, i cₖ valgono (2,5 · 4 · 4,5 · 4 · 2,5)/17,5 e
 * √(64,75/306,25) ≈ 0,4598 — il "sd(slope) ≈ 0,46σ" del rilievo. La
 * vecchia z divideva la pendenza per σ direttamente: era sottostimata di
 * questo fattore, e la soglia 0,5 corrispondeva a ~0,5/0,46 ≈ 1,09 sd
 * dello stimatore → ~28% di falsi positivi.
 */
export function slopeNoiseFactor(window: number): number {
  const meanX = (window - 1) / 2;
  let den = 0;
  for (let i = 0; i < window; i += 1) den += (i - meanX) ** 2;
  let acc = 0;
  let sumSq = 0;
  for (let k = window - 1; k >= 1; k -= 1) {
    acc += (k - meanX) / den;
    sumSq += acc * acc;
  }
  return Math.sqrt(sumSq);
}

/**
 * Pendenza dei minimi quadrati per passo di osservazione (x = 0,1,2…).
 * null con meno di 2 punti.
 */
export function linearSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const v of values) meanY += v;
  meanY /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Deviazione standard di popolazione; null con meno di 2 valori. */
export function stdDev(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  return Math.sqrt(variance / n);
}

export interface TrendResult {
  label: TrendLabel;
  z: number;
  /** Pendenza grezza, nelle unità della serie per passo di osservazione. */
  slope: number;
}

/**
 * TREND: pendenza sulle ultime TREND_WINDOW osservazioni, normalizzata
 * sulla deviazione standard DELLA PENDENZA sotto rumore (Q-03):
 *
 *   z = slope / (σ · slopeNoiseFactor(TREND_WINDOW))
 *
 * dove σ è la sd delle variazioni periodo-su-periodo stimata sugli ultimi
 * TREND_SD_YEARS anni (fallback alla storia intera se la finestra recente
 * non raggiunge MIN_HISTORY_SAMPLES variazioni). Così z è ~N(0,1) su una
 * passeggiata aleatoria e la soglia ha una copertura nota (~10% di falsi
 * trend, verificata da un test Monte Carlo). Serie senza variazioni
 * (σ=0) = laterale per definizione.
 */
export function trendMetric(
  observations: FredObservation[],
): TrendResult | null {
  if (observations.length < TREND_WINDOW) return null;
  if (observations.length - 1 < MIN_HISTORY_SAMPLES) return null;

  // Variazioni sulla finestra recente (TREND_SD_YEARS dall'ultima
  // osservazione); sotto la soglia di campioni, l'intera storia.
  const lastDays = dateKeyToDays(observations[observations.length - 1].date);
  const fromDays = lastDays - Math.round(TREND_SD_YEARS * 365.25);
  const recent = observations.filter((o) => dateKeyToDays(o.date) >= fromDays);
  const source = recent.length - 1 >= MIN_HISTORY_SAMPLES ? recent : observations;
  const diffs: number[] = [];
  for (let i = 1; i < source.length; i += 1) {
    diffs.push(source[i].value - source[i - 1].value);
  }

  const sd = stdDev(diffs);
  const slope = linearSlope(
    observations.slice(-TREND_WINDOW).map((o) => o.value),
  );
  if (sd === null || slope === null) return null;
  if (sd === 0) {
    // Variazioni recenti tutte identiche: una pendenza non nulla è un
    // trend "infinitamente" netto (z convenzionale ±99, mai Infinity nel
    // payload RSC); pendenza nulla = serie ferma.
    if (slope === 0) return { label: "laterale", z: 0, slope };
    return slope > 0
      ? { label: "rialzista", z: 99, slope }
      : { label: "ribassista", z: -99, slope };
  }
  const z = slope / (sd * slopeNoiseFactor(TREND_WINDOW));
  const label: TrendLabel =
    Math.abs(z) < TREND_Z_THRESHOLD
      ? "laterale"
      : z > 0
        ? "rialzista"
        : "ribassista";
  return { label, z, slope };
}

interface ChangeSpec {
  label: string;
  /** "prev" = osservazione precedente; numero = giorni indietro dal punto più recente. */
  target: "prev" | number;
  toleranceDays: number;
}

/**
 * Variazioni per cadenza (spec FASE 29): mensili MoM+YoY, trimestrali
 * QoQ+YoY, daily/weekly 1 settimana + 1 mese. Aggancio all'osservazione
 * reale più vicina entro tolleranza, mai interpolazioni.
 */
const CHANGE_SPECS: Record<SeriesCadence, ChangeSpec[]> = {
  monthly: [
    { label: "MoM", target: "prev", toleranceDays: 0 },
    { label: "YoY", target: 365, toleranceDays: 47 },
  ],
  quarterly: [
    { label: "QoQ", target: "prev", toleranceDays: 0 },
    { label: "YoY", target: 365, toleranceDays: 95 },
  ],
  daily: [
    { label: "1S", target: 7, toleranceDays: 5 },
    { label: "1M", target: 30, toleranceDays: 10 },
  ],
  weekly: [
    { label: "1S", target: 7, toleranceDays: 4 },
    { label: "1M", target: 30, toleranceDays: 15 },
  ],
};

export function periodChanges(
  observations: FredObservation[],
  cadence: SeriesCadence,
  deltaMode: DeltaMode,
): PeriodChange[] {
  const pct = deltaMode === "pct";
  const specs = CHANGE_SPECS[cadence];
  if (observations.length === 0) {
    return specs.map((s) => ({ label: s.label, value: null, pct }));
  }
  const last = observations[observations.length - 1];
  const lastDays = dateKeyToDays(last.date);

  return specs.map((spec) => {
    let base: FredObservation | null = null;
    if (spec.target === "prev") {
      base =
        observations.length > 1 ? observations[observations.length - 2] : null;
    } else {
      base = nearestObservation(
        observations,
        lastDays - spec.target,
        spec.toleranceDays,
      );
    }
    if (base === null || base.date === last.date) {
      return { label: spec.label, value: null, pct };
    }
    if (pct) {
      if (base.value === 0) return { label: spec.label, value: null, pct };
      return {
        label: spec.label,
        value: ((last.value - base.value) / Math.abs(base.value)) * 100,
        pct,
      };
    }
    return { label: spec.label, value: last.value - base.value, pct };
  });
}

/**
 * PERCENTILE STORICO: quota di osservazioni dell'INTERA storia disponibile
 * ≤ ultimo valore (stessa convenzione del percentileRank a finestra).
 */
export function percentileAllHistory(
  observations: FredObservation[],
): number | null {
  const n = observations.length;
  if (n < MIN_HISTORY_SAMPLES) return null;
  const last = observations[n - 1].value;
  let atOrBelow = 0;
  for (const o of observations) {
    if (o.value <= last) atOrBelow += 1;
  }
  return Math.round((atOrBelow / n) * 100);
}

/**
 * POSIZIONE DEL LIVELLO nel proprio regime: z-score dell'ultimo valore su
 * media e dev. std. degli ultimi CYCLE_LEVEL_YEARS anni (Q-04).
 *
 * ── COSA C'ERA QUI PRIMA, E PERCHE' NON C'E' PIU' ────────────────────────
 *
 * Fino al 28/08/2026 questa funzione assegnava anche un QUADRANTE di ciclo
 * economico — espansione, rallentamento, contrazione, ripresa — incrociando
 * questo livello col segno della pendenza del trend. L'etichetta è stata
 * rimossa: misurata su 105 settimane di dati FRED reali, quattro settori su
 * nove non l'avevano dichiarata MAI in due anni, altri quattro fra il 2,9% e
 * l'8,6% delle settimane, e l'unico che parlava spesso cambiava idea 8 volte
 * su 11. Le misure stanno in docs/macro-desk/CICLO-TRENDS-2026-08-28.md.
 *
 * Il livello invece resta, perché è un FATTO e non dipende dalla pendenza:
 * dove sta il valore di oggi rispetto al proprio decennio.
 *
 * Due esclusioni EREDITATE dalla vecchia funzione, tenute per non cambiare
 * ciò che le pagine mostrano oggi: le serie `neutral` (tassi, breakeven) non
 * ricevono levelZ, e nemmeno la Volatilità (via `includeLevelZ`). Erano
 * esclusioni pensate per il quadrante, non per il livello: rivederle è una
 * decisione a sé, non un effetto collaterale di questa rimozione.
 */
export function levelZMetric(
  observations: FredObservation[],
  goodDirection: GoodDirection,
): number | null {
  if (goodDirection === "neutral") return null;
  if (observations.length < MIN_HISTORY_SAMPLES) return null;
  // Q-04 — il livello si confronta con gli ultimi CYCLE_LEVEL_YEARS anni,
  // non con l'intera storia: un Fed funds al 4,5% è "alto" rispetto al
  // decennio ZIRP e "medio" rispetto al 1980 — la media full-history
  // mescola regimi incomparabili. Fallback DICHIARATO alla storia intera
  // quando la finestra non raggiunge MIN_HISTORY_SAMPLES campioni.
  const lastDays = dateKeyToDays(observations[observations.length - 1].date);
  const fromDays = lastDays - Math.round(CYCLE_LEVEL_YEARS * 365.25);
  const windowed = observations.filter(
    (o) => dateKeyToDays(o.date) >= fromDays,
  );
  const source = windowed.length >= MIN_HISTORY_SAMPLES ? windowed : observations;
  const values = source.map((o) => o.value);
  const sd = stdDev(values);
  if (sd === null || sd === 0) return null;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  return (values[values.length - 1] - mean) / sd;
}

export interface MetricsOptions {
  cadence: SeriesCadence;
  deltaMode: DeltaMode;
  /** false per la sezione Volatilità (esclusione ereditata: v. `levelZMetric`). */
  includeLevelZ: boolean;
  /** Direzione economica della serie: le `neutral` non ricevono levelZ. */
  goodDirection: GoodDirection;
}

/**
 * Orchestratore: ogni metrica degrada a null per conto suo, mai un crash.
 *
 * STORIA DEL CICLO, in due tappe, perché spiega cosa NON c'è più qui.
 *
 * Il 26/08/2026 l'etichetta di ciclo era stata messa dietro un cancello:
 * senza una direzione dimostrata niente quadrante, perché col trend laterale
 * il segno della pendenza è indistinguibile da zero e il quadrante cambiava
 * nel 24,4% dei mesi contro l'1,9% quando il trend era significativo.
 *
 * Il 28/08/2026 l'etichetta è stata TOLTA. Il cancello funzionava — troppo
 * bene: ricostruite 105 settimane sui dati FRED reali, quattro settori su
 * nove non hanno mai dichiarato un ciclo in due anni, altri quattro l'hanno
 * fatto fra il 2,9% e l'8,6% delle settimane, e l'unico che parlava spesso
 * (Liquidità, 38%) cambiava etichetta 8 volte su 11. Una riga che tace nel
 * 91-100% dei casi non è informazione degradata: è spazio che insegna a non
 * guardare. Misure e ragionamento in
 * docs/macro-desk/CICLO-TRENDS-2026-08-28.md.
 *
 * Non è stata ritarata perché il problema non era la soglia: un ciclo
 * economico si muove su trimestri, e certificarne la direzione su sei
 * osservazioni è chiedere a un test statistico una cosa che a quel passo non
 * si vede. Resta `levelZ`, che è un FATTO — dove sta il livello rispetto al
 * proprio decennio — e non dipende dalla pendenza.
 */
export function computeSeriesMetrics(
  observations: FredObservation[],
  options: MetricsOptions,
): SeriesMetrics {
  const trend = trendMetric(observations);
  /* `trend !== null` è una condizione EREDITATA: prima il livello usciva dal
     calcolo del quadrante, che serviva la pendenza. Tenuta perché toglierla
     cambierebbe ciò che vede chi guarda le serie con esattamente 20
     osservazioni — un effetto collaterale che questa rimozione non deve
     avere. Rivederla è una decisione a sé. */
  const levelZ =
    options.includeLevelZ && trend !== null
      ? levelZMetric(observations, options.goodDirection)
      : null;
  return {
    trend: trend?.label ?? null,
    trendZ: trend?.z ?? null,
    changes: periodChanges(observations, options.cadence, options.deltaMode),
    // Q-04 — percentile sulla finestra di regime (10A, stesso gate a 20
    // campioni di percentileRank); serie più corta → storia intera.
    percentile:
      percentileRank(observations, CYCLE_LEVEL_YEARS) ??
      percentileAllHistory(observations),
    historyStartYear:
      observations.length > 0 ? observations[0].date.slice(0, 4) : null,
    levelZ,
  };
}
