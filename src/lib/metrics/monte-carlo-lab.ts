import Decimal from "decimal.js";
import { mulberry32, MONTE_CARLO_MIN_TRADES } from "./monte-carlo";
import type { MetricInfoData } from "./types";

/**
 * MONTE CARLO — versione completa per la pagina Analytics.
 *
 * ESTENDE il widget della dashboard (`monteCarloR` in monte-carlo.ts), non
 * lo sostituisce: quello resta la fascia sintetica in R, questo aggiunge il
 * modello di rischio, l'equity in valuta, le distribuzioni finali e le
 * probabilità. Il metodo primario è lo stesso — bootstrap con reinserimento
 * sugli R realizzati storici — perché preserva distribuzione reale, code e
 * asimmetria: una simulazione parametrica da media e deviazione standard
 * inventerebbe una normale che i risultati di trading non hanno.
 *
 * NOTA SUI TIPI: qui si lavora in float, come già nel widget. È una
 * simulazione probabilistica di visualizzazione, non contabilità: nessun
 * importo di questa funzione finisce mai in un saldo o in un P&L. Gli input
 * monetari arrivano come stringhe decimali e vengono convertiti una volta
 * sola, in ingresso; l'RNG è deterministico (seed esplicito), quindi
 * l'output è riproducibile e verificabile.
 *
 * LIMITE STRUTTURALE, dichiarato in UI: il bootstrap assume trade
 * indipendenti e identicamente distribuiti. Non modella autocorrelazione
 * (le serie di perdite reali si raggruppano), né cambi di regime, né il
 * fatto che il trader cambi comportamento dopo un drawdown. È
 * un'illustrazione statistica, non una previsione.
 */

export type MonteCarloMethod = "bootstrap" | "parametric";
export type RiskMode = "fixed-fractional" | "fixed-amount";

/** Preset di orizzonte in numero di trade. */
export const HORIZON_PRESETS = [100, 250, 500, 1000] as const;

/** Soglie di drawdown per cui si riporta la probabilità di superamento. */
export const DRAWDOWN_THRESHOLDS = [0.1, 0.2, 0.3, 0.5] as const;

export const DEFAULT_SIMS = 5000;
export const MAX_SIMS = 10000;
export const DEFAULT_SEED = 20260729;

export interface MonteCarloLabOptions {
  /** Numero di trade futuri simulati. */
  horizon: number;
  /** Iterazioni (path simulati). */
  sims?: number;
  seed?: number;
  method?: MonteCarloMethod;
  riskMode?: RiskMode;
  /**
   * Rischio per trade: frazione dell'equity (fixed-fractional, es. "0.01")
   * oppure importo fisso in valuta (fixed-amount).
   */
  riskPerTrade: string;
  /** Equity di partenza in valuta. */
  startingEquity: string;
  /** Perdita frazionaria che si considera "rovina" (default 50% dell'equity). */
  ruinThreshold?: number;
}

export interface FanPoint {
  trade: number;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface Percentiles {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface HistogramBar {
  /** Bordo inferiore del bin (equity finale in valuta). */
  from: number;
  to: number;
  count: number;
  /** True se il bin contiene equity sotto quella di partenza. */
  losing: boolean;
}

export interface MonteCarloLabResult {
  /** Fan chart dell'EQUITY (non del cumulato R): percentili per passo. */
  fan: FanPoint[];
  /** Equity finale in valuta. */
  finalEquity: Percentiles;
  /** Ritorno finale come frazione dell'equity iniziale (0.25 = +25%). */
  finalReturn: Percentiles;
  histogram: HistogramBar[];
  /** Max drawdown come frazione del picco, fra tutti i path. */
  maxDrawdown: { median: number; p95: number };
  /** P(equity finale > equity iniziale). */
  probProfit: number;
  /** P(max drawdown oltre soglia), per ciascuna soglia richiesta. */
  probDrawdownOver: { threshold: number; probability: number }[];
  /** P(l'equity scende sotto la soglia di rovina in un qualunque momento). */
  riskOfRuin: number;
  sims: number;
  horizon: number;
  /** R storici usati come urna del bootstrap. */
  sampleSize: number;
  method: MonteCarloMethod;
  riskMode: RiskMode;
  seed: number;
}

function percentileOf(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(p * (sorted.length - 1))),
  );
  return sorted[index];
}

function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p05: percentileOf(sorted, 0.05),
    p25: percentileOf(sorted, 0.25),
    p50: percentileOf(sorted, 0.5),
    p75: percentileOf(sorted, 0.75),
    p95: percentileOf(sorted, 0.95),
  };
}

/** Parametri del metodo secondario, derivati dagli stessi R storici. */
export interface ParametricParams {
  winRate: number;
  avgWinR: number;
  avgLossR: number;
}

export function parametricParams(sample: number[]): ParametricParams | null {
  const wins = sample.filter((r) => r > 0);
  const losses = sample.filter((r) => r < 0);
  if (wins.length === 0 || losses.length === 0) return null;
  return {
    winRate: wins.length / sample.length,
    avgWinR: wins.reduce((a, b) => a + b, 0) / wins.length,
    avgLossR: losses.reduce((a, b) => a + b, 0) / losses.length,
  };
}

/**
 * Il fan chart non ha bisogno di un punto per ogni trade: oltre un centinaio
 * di punti il grafico non guadagna leggibilità e il costo dei percentili
 * (un ordinamento per passo) cresce inutilmente.
 */
function fanStride(horizon: number): number {
  return Math.max(1, Math.ceil(horizon / 100));
}

export function monteCarloLab(
  rValues: string[],
  options: MonteCarloLabOptions,
): MonteCarloLabResult | null {
  const sample = rValues
    .filter((v) => v.trim() !== "")
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (sample.length < MONTE_CARLO_MIN_TRADES) return null;

  const sims = Math.min(MAX_SIMS, Math.max(100, options.sims ?? DEFAULT_SIMS));
  const horizon = Math.max(1, Math.min(2000, options.horizon));
  const seed = options.seed ?? DEFAULT_SEED;
  const method = options.method ?? "bootstrap";
  const riskMode = options.riskMode ?? "fixed-fractional";
  const ruinThreshold = options.ruinThreshold ?? 0.5;

  const start = new Decimal(options.startingEquity).toNumber();
  const risk = new Decimal(options.riskPerTrade).toNumber();
  if (!Number.isFinite(start) || start <= 0) return null;
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const rng = mulberry32(seed);
  const parametric = method === "parametric" ? parametricParams(sample) : null;
  // Il parametrico senza vincite o senza perdite non è definibile: si
  // ricade sul bootstrap invece di inventare una distribuzione.
  const useParametric = parametric !== null;

  /** Estrae un R: dall'urna storica, o dai parametri win/loss. */
  function drawR(): number {
    if (method === "parametric" && useParametric) {
      return rng() < parametric.winRate ? parametric.avgWinR : parametric.avgLossR;
    }
    return sample[Math.floor(rng() * sample.length)];
  }

  const equity = new Array<number>(sims).fill(start);
  const peak = new Array<number>(sims).fill(start);
  const maxDd = new Array<number>(sims).fill(0);
  const ruined = new Array<boolean>(sims).fill(false);
  const ruinFloor = start * (1 - ruinThreshold);

  const stride = fanStride(horizon);
  const fan: FanPoint[] = [];

  for (let step = 1; step <= horizon; step++) {
    for (let sim = 0; sim < sims; sim++) {
      // Rovina assorbente: un conto azzerato non continua a operare.
      if (ruined[sim]) continue;

      // Rischio per trade: quota dell'equity corrente (compounding) oppure
      // importo fisso. È il modello di rischio a decidere se una serie di
      // perdite si autolimita o no.
      const stake =
        riskMode === "fixed-fractional" ? equity[sim] * risk : risk;
      equity[sim] += drawR() * stake;

      if (equity[sim] > peak[sim]) peak[sim] = equity[sim];
      const dd = peak[sim] > 0 ? (peak[sim] - equity[sim]) / peak[sim] : 0;
      if (dd > maxDd[sim]) maxDd[sim] = dd;
      if (equity[sim] <= ruinFloor) ruined[sim] = true;
    }

    if (step % stride === 0 || step === horizon) {
      const p = percentiles(equity);
      fan.push({ trade: step, ...p });
    }
  }

  const finalEquity = percentiles(equity);
  const finalReturn = percentiles(equity.map((e) => (e - start) / start));

  return {
    fan,
    finalEquity,
    finalReturn,
    histogram: buildHistogram(equity, start),
    maxDrawdown: {
      median: percentileOf([...maxDd].sort((a, b) => a - b), 0.5),
      p95: percentileOf([...maxDd].sort((a, b) => a - b), 0.95),
    },
    probProfit: equity.filter((e) => e > start).length / sims,
    probDrawdownOver: DRAWDOWN_THRESHOLDS.map((threshold) => ({
      threshold,
      probability: maxDd.filter((d) => d > threshold).length / sims,
    })),
    riskOfRuin: ruined.filter(Boolean).length / sims,
    sims,
    horizon,
    sampleSize: sample.length,
    method: method === "parametric" && !useParametric ? "bootstrap" : method,
    riskMode,
    seed,
  };
}

/** Istogramma dell'equity finale: 24 bin sull'intervallo osservato. */
function buildHistogram(values: number[], start: number): HistogramBar[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!(max > min)) {
    return [{ from: min, to: max, count: values.length, losing: min < start }];
  }
  const bins = 24;
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const index = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[index] += 1;
  }
  return counts.map((count, i) => {
    const from = min + i * width;
    const to = from + width;
    return { from, to, count, losing: to <= start };
  });
}

/**
 * ORIZZONTE TEMPORALE → numero di trade, tramite la frequenza storica.
 *
 * L'assunzione (che va dichiarata in UI) è che il trader continui a operare
 * con la stessa frequenza del passato. Null se lo storico è troppo corto per
 * stimarla: meglio non offrire l'opzione che offrirla su una base fragile.
 */
export const MIN_DAYS_FOR_FREQUENCY = 30;

export function tradesPerDay(
  totalTrades: number,
  coveredDays: number,
): number | null {
  if (coveredDays < MIN_DAYS_FOR_FREQUENCY || totalTrades <= 0) return null;
  return totalTrades / coveredDays;
}

export function horizonFromMonths(
  months: number,
  perDay: number | null,
): number | null {
  if (perDay === null) return null;
  return Math.max(1, Math.round(months * 30.44 * perDay));
}

export const monteCarloLabInfo: MetricInfoData = {
  label: "Simulazione Monte Carlo",
  description:
    "Ricampiona i TUOI R storici per costruire migliaia di futuri possibili e mostrare dove potrebbe finire l'equity. Serve a farsi un'idea della VARIABILITÀ — quanto può andare male una serie normale — non a prevedere il risultato. Assume trade indipendenti e distribuzione stabile: la realtà raggruppa le perdite e cambia regime.",
  formula:
    "N scenari × H trade estratti a caso dai tuoi R storici · equity = equity + R × rischio · fasce = percentili 5/25/50/75/95",
};

export const riskOfRuinInfo: MetricInfoData = {
  label: "Risk of ruin",
  description:
    "Quante simulazioni su cento perdono la quota di capitale che hai indicato come soglia di rovina, in un momento qualunque del percorso — non solo alla fine. È la domanda che conta davvero: non «quanto guadagnerò» ma «quante probabilità ho di non arrivare in fondo».",
  formula: "Path che toccano l'equity di rovina / path totali",
};
