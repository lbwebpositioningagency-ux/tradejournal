import type { MetricInfoData } from "./types";

/**
 * W4 — proiezione Monte Carlo sugli R-multiple: simula i prossimi N trade
 * RICAMPIONANDO i tuoi R storici (bootstrap i.i.d.) e mostra la fascia degli
 * esiti attesi in R cumulati.
 *
 * NOTA sul tipo numerico: questa è una SIMULAZIONE probabilistica di
 * visualizzazione, non contabilità — gira in float per costo computazionale
 * (50.000 estrazioni); nessun importo monetario passa di qui. RNG
 * deterministico (seed fisso): stessa storia di R → stessa proiezione,
 * riproducibile e verificabile.
 *
 * Limite dichiarato: il bootstrap assume trade indipendenti e una
 * distribuzione degli R stazionaria — è una fascia di riferimento, non una
 * previsione.
 */

export interface MonteCarloStep {
  /** Numero del trade simulato (1..horizon). */
  trade: number;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface MonteCarloResult {
  steps: MonteCarloStep[];
  /** Frazione di simulazioni che chiudono in negativo dopo horizon trade. */
  probNegative: string;
  /** Mediana del peggior drawdown in R dentro l'orizzonte (≥ 0). */
  medianMaxDrawdownR: string;
  /** Esito mediano finale in R. */
  medianFinalR: string;
  sims: number;
  horizon: number;
  sampleSize: number;
}

/** Minimo di R storici per una proiezione onesta (stessa soglia dell'SQN). */
export const MONTE_CARLO_MIN_TRADES = 30;

/** RNG deterministico (mulberry32), lo stesso schema del seed del progetto. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(p * (sorted.length - 1))),
  );
  return sorted[index];
}

export function monteCarloR(
  rValues: string[],
  options?: { horizon?: number; sims?: number; rng?: () => number },
): MonteCarloResult | null {
  const sample = rValues
    .filter((v) => v.trim() !== "") // Number("") sarebbe 0, non un dato
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (sample.length < MONTE_CARLO_MIN_TRADES) return null;

  const horizon = options?.horizon ?? 100;
  const sims = options?.sims ?? 500;
  const rng = options?.rng ?? mulberry32(20260728);

  // paths[step][sim] = R cumulato al passo step della simulazione sim.
  const cumulative = new Array<number>(sims).fill(0);
  const finals: number[] = [];
  const maxDrawdowns = new Array<number>(sims).fill(0);
  const peaks = new Array<number>(sims).fill(0);
  const steps: MonteCarloStep[] = [];

  for (let step = 1; step <= horizon; step++) {
    for (let sim = 0; sim < sims; sim++) {
      const draw = sample[Math.floor(rng() * sample.length)];
      cumulative[sim] += draw;
      if (cumulative[sim] > peaks[sim]) peaks[sim] = cumulative[sim];
      const dd = peaks[sim] - cumulative[sim];
      if (dd > maxDrawdowns[sim]) maxDrawdowns[sim] = dd;
    }
    const sorted = [...cumulative].sort((a, b) => a - b);
    steps.push({
      trade: step,
      p05: percentile(sorted, 0.05),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p95: percentile(sorted, 0.95),
    });
  }
  finals.push(...cumulative);

  const negative = finals.filter((v) => v < 0).length;
  const sortedDd = [...maxDrawdowns].sort((a, b) => a - b);
  const sortedFinals = [...finals].sort((a, b) => a - b);

  return {
    steps,
    probNegative: (negative / sims).toFixed(4),
    medianMaxDrawdownR: percentile(sortedDd, 0.5).toFixed(2),
    medianFinalR: percentile(sortedFinals, 0.5).toFixed(2),
    sims,
    horizon,
    sampleSize: sample.length,
  };
}

export const monteCarloInfo: MetricInfoData = {
  label: "Proiezione Monte Carlo",
  description:
    "Simula i prossimi 100 trade ricampionando i TUOI R-multiple storici (500 scenari, seed fisso: riproducibile). La fascia mostra dove potrebbe stare il tuo R cumulato se continui a operare così. Assume trade indipendenti e distribuzione stabile: è una fascia di riferimento, non una previsione.",
  formula:
    "500 scenari × 100 trade estratti a caso dai tuoi R storici · fasce = percentili 5/25/50/75/95 del cumulato",
};
