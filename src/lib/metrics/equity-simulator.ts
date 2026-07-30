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

export const equitySimulatorInfo: MetricInfoData = {
  label: "Equity curve simulator",
  description:
    "Genera percorsi di equity possibili a partire da tre numeri: probabilità di vincita, rapporto vincita/perdita in R e rischio per trade (in % dell'equity corrente, quindi con compounding, o in importo fisso). Ogni linea è un futuro plausibile con quei parametri; la linea in grassetto è la media. Serve a vedere la variabilità di un edge, non a prevedere il tuo risultato.",
  formula:
    "per ogni trade: u ~ U(0,1) · esito = +ratio R se u < p, altrimenti −1 R · equity += esito × rischio",
};
