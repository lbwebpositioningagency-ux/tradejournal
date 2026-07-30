import { mulberry32 } from "./monte-carlo";
import type { MetricInfoData } from "./types";

/**
 * EQUITY CURVE SIMULATOR (Fase 34) — sostituisce il Monte Carlo a bande
 * percentili della pagina Analytics.
 *
 * MODELLO, dichiarato in UI: ogni trade è una moneta truccata. Con
 * probabilità `winProbability` l'esito è +`winLossRatio` R, altrimenti −1 R;
 * l'importo rischiato per trade è una frazione dell'EQUITY CORRENTE
 * (compounding) oppure un importo fisso in valuta. Nessun ricampionamento
 * dello storico: i parametri sono tre numeri che l'utente può modificare,
 * ed è questo il punto — vedere come cambia il ventaglio cambiando l'edge.
 *
 * NOTA SUI TIPI: si lavora in float, come il Monte Carlo che questo modulo
 * sostituisce. È una simulazione di visualizzazione, non contabilità:
 * nessun importo prodotto qui finisce mai in un saldo o in un P&L. L'RNG è
 * deterministico (seed esplicito), quindi l'output è riproducibile e
 * verificabile nei test.
 */

export type EquityRiskMode = "percent" | "amount";

export interface EquitySimulatorInput {
  /** Equity di partenza in valuta (> 0). */
  startEquity: number;
  /** Probabilità di vincita come frazione 0-1. */
  winProbability: number;
  /** R guadagnati da un trade vincente ("X : 1"); la perdita vale 1 R. */
  winLossRatio: number;
  /** Trade per percorso. */
  trades: number;
  /** Numero di percorsi indipendenti (le "linee" del grafico). */
  lines: number;
  riskMode: EquityRiskMode;
  /**
   * Rischio per trade: frazione 0-1 dell'equity corrente (percent) oppure
   * importo fisso in valuta (amount).
   */
  riskValue: number;
  seed: number;
}

/** Limiti difensivi: oltre, il grafico non guadagna nulla e il costo sì. */
export const SIM_MAX_TRADES = 1000;
export const SIM_MAX_LINES = 100;

export interface EquitySimulatorResult {
  /**
   * Un array per percorso, lungo `trades + 1`: l'indice 0 è l'equity di
   * partenza, l'indice t l'equity dopo il trade t. Un conto azzerato resta
   * a zero (rovina assorbente: non si continua a operare senza capitale).
   */
  paths: number[][];
  /** Media dell'equity a ogni passo, attraverso tutti i percorsi. */
  mean: number[];
}

export function simulateEquityCurves(
  input: EquitySimulatorInput,
): EquitySimulatorResult | null {
  const {
    startEquity,
    winProbability,
    winLossRatio,
    riskMode,
    riskValue,
    seed,
  } = input;

  if (!Number.isFinite(startEquity) || startEquity <= 0) return null;
  if (!Number.isFinite(winProbability) || winProbability < 0 || winProbability > 1)
    return null;
  if (!Number.isFinite(winLossRatio) || winLossRatio <= 0) return null;
  if (!Number.isFinite(riskValue) || riskValue <= 0) return null;
  if (riskMode === "percent" && riskValue >= 1) return null;

  const trades = Math.min(SIM_MAX_TRADES, Math.max(1, Math.floor(input.trades)));
  const lines = Math.min(SIM_MAX_LINES, Math.max(1, Math.floor(input.lines)));

  const rng = mulberry32(seed);
  const paths: number[][] = [];

  for (let line = 0; line < lines; line++) {
    const path = new Array<number>(trades + 1);
    let equity = startEquity;
    path[0] = equity;

    for (let t = 1; t <= trades; t++) {
      if (equity > 0) {
        // Il rischio in % si riferisce all'equity CORRENTE (compounding);
        // l'importo fisso non può comunque superare quel che resta.
        const stake =
          riskMode === "percent" ? equity * riskValue : Math.min(riskValue, equity);
        const r = rng() < winProbability ? winLossRatio : -1;
        equity = Math.max(0, equity + r * stake);
      }
      path[t] = equity;
    }
    paths.push(path);
  }

  const mean = new Array<number>(trades + 1).fill(0);
  for (const path of paths) {
    for (let t = 0; t <= trades; t++) mean[t] += path[t];
  }
  for (let t = 0; t <= trades; t++) mean[t] /= lines;

  return { paths, mean };
}

// ── Fase 34b — statistiche e bande derivate dai percorsi ─────────────────
//
// Tutto DERIVATO da `paths`: nessuna seconda simulazione, così tabella e
// bande raccontano esattamente le linee che si vedono nel grafico. Con
// poche linee (default 20) i percentili estremi sono grezzi — è il prezzo
// dichiarato di leggere le stesse curve del grafico invece di un campione
// più largo.

export interface Percentiles {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
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

/** Perdita frazionaria che si considera "rovina" (come il vecchio MC). */
export const RUIN_THRESHOLD = 0.5;

export interface EquitySimulatorStats {
  /** P(equity finale > equity iniziale). */
  probProfit: number;
  /** Equity finale in valuta, per percentile di scenario. */
  finalEquity: Percentiles;
  /** Ritorno finale come frazione dell'equity iniziale (0.25 = +25%). */
  finalReturn: Percentiles;
  /** Max drawdown come frazione del picco, per percentile di scenario. */
  maxDrawdown: Percentiles;
  /** P(l'equity scende sotto la soglia di rovina in un momento qualunque). */
  riskOfRuin: number;
  lines: number;
}

/** Max drawdown frazionario (dal picco) di un singolo percorso. */
export function pathMaxDrawdown(path: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of path) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function equityStatsFromPaths(
  paths: number[][],
  startEquity: number,
): EquitySimulatorStats | null {
  if (paths.length === 0 || !Number.isFinite(startEquity) || startEquity <= 0)
    return null;

  const finals = paths.map((p) => p[p.length - 1]);
  const drawdowns = paths.map(pathMaxDrawdown);
  const ruinFloor = startEquity * (1 - RUIN_THRESHOLD);

  return {
    probProfit: finals.filter((v) => v > startEquity).length / paths.length,
    finalEquity: percentiles(finals),
    finalReturn: percentiles(finals.map((v) => (v - startEquity) / startEquity)),
    maxDrawdown: percentiles(drawdowns),
    riskOfRuin:
      paths.filter((p) => p.some((v) => v <= ruinFloor)).length / paths.length,
    lines: paths.length,
  };
}

export interface EquityBandPoint {
  mean: number;
  /** Deviazione standard di POPOLAZIONE (÷N) dell'equity al passo. */
  sd: number;
  /** media ± 1σ (~68% degli esiti), pavimento a zero. */
  inner: [number, number];
  /** media ± 2σ (~95% degli esiti), pavimento a zero. */
  outer: [number, number];
}

/** Bande di deviazione standard per passo, dagli STESSI percorsi del grafico. */
export function equityBandsFromPaths(paths: number[][]): EquityBandPoint[] {
  if (paths.length === 0) return [];
  const steps = paths[0].length;
  const bands: EquityBandPoint[] = new Array(steps);
  for (let t = 0; t < steps; t++) {
    let sum = 0;
    for (const path of paths) sum += path[t];
    const mean = sum / paths.length;
    let squares = 0;
    for (const path of paths) {
      const d = path[t] - mean;
      squares += d * d;
    }
    const sd = Math.sqrt(squares / paths.length);
    bands[t] = {
      mean,
      sd,
      // L'equity non può essere negativa: la banda non deve suggerirlo.
      inner: [Math.max(0, mean - sd), mean + sd],
      outer: [Math.max(0, mean - 2 * sd), mean + 2 * sd],
    };
  }
  return bands;
}

export const equitySimulatorInfo: MetricInfoData = {
  label: "Equity curve simulator",
  description:
    "Genera percorsi di equity possibili a partire da tre numeri: probabilità di vincita, rapporto vincita/perdita in R e rischio per trade (in % dell'equity corrente, quindi con compounding, o in importo fisso). Ogni linea è un futuro plausibile con quei parametri; la linea in grassetto è la media. Serve a vedere la variabilità di un edge, non a prevedere il tuo risultato.",
  formula:
    "per ogni trade: u ~ U(0,1) · esito = +ratio R se u < p, altrimenti −1 R · equity += esito × rischio",
};
