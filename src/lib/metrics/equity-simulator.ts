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

// ── Fase 37 — statistiche AGGREGATE su tutte le linee ────────────────────
//
// Lettura diversa da quella per percentili (Fase 34b), non alternativa:
// lì si sceglie il percorso che occupa una certa posizione in classifica,
// qui si riassumono TUTTE le linee insieme. È il motivo per cui Max Equity
// e la riga «Migliore (95%)» non coincidono quasi mai — e va detto in UI,
// altrimenti sembra un errore.

export interface PathStreaks {
  maxWins: number;
  maxLosses: number;
}

/**
 * Streak massime di un percorso, DERIVATE dai passi dell'equity: un passo
 * in salita è una vincita, uno in discesa una perdita.
 *
 * Un passo piatto (delta zero) non è né l'una né l'altra e SPEZZA entrambe
 * le serie: succede solo dopo la rovina, quando il conto è azzerato e non
 * opera più — contarlo come perdita gonfierebbe la serie negativa con
 * trade che non sono mai avvenuti.
 */
export function pathStreaks(path: number[]): PathStreaks {
  let maxWins = 0;
  let maxLosses = 0;
  let wins = 0;
  let losses = 0;
  for (let t = 1; t < path.length; t++) {
    const delta = path[t] - path[t - 1];
    if (delta > 0) {
      wins += 1;
      losses = 0;
      if (wins > maxWins) maxWins = wins;
    } else if (delta < 0) {
      losses += 1;
      wins = 0;
      if (losses > maxLosses) maxLosses = losses;
    } else {
      wins = 0;
      losses = 0;
    }
  }
  return { maxWins, maxLosses };
}

export interface EquityAggregateStats {
  /** Equity finale più alta fra tutte le linee (valuta). */
  maxEquity: number;
  /** Media delle equity finali (valuta). */
  meanEquity: number;
  /** Media dei max drawdown delle linee (frazione del picco). */
  avgMaxDrawdown: number;
  /** Il max drawdown peggiore osservato (frazione del picco). */
  biggestMaxDrawdown: number;
  /** Serie di vincite più lunga osservata su una qualunque linea. */
  maxConsecutiveWins: number;
  /** Serie di perdite più lunga osservata su una qualunque linea. */
  maxConsecutiveLosses: number;
  /** Media dei ritorni finali (frazione dell'equity iniziale). */
  avgPerformance: number;
  /**
   * Average performance / average max drawdown (rapporto tipo Calmar).
   * null quando il drawdown medio è zero: il rapporto non è definito, e un
   * numero finto direbbe più del dato.
   */
  returnOnMaxDrawdown: number | null;
  lines: number;
}

export function equityAggregatesFromPaths(
  paths: number[][],
  startEquity: number,
): EquityAggregateStats | null {
  if (paths.length === 0 || !Number.isFinite(startEquity) || startEquity <= 0)
    return null;

  const finals = paths.map((p) => p[p.length - 1]);
  const drawdowns = paths.map(pathMaxDrawdown);
  const returns = finals.map((v) => (v - startEquity) / startEquity);
  const streaks = paths.map(pathStreaks);
  const mean = (values: number[]) =>
    values.reduce((a, b) => a + b, 0) / values.length;

  const avgMaxDrawdown = mean(drawdowns);
  const avgPerformance = mean(returns);

  return {
    maxEquity: Math.max(...finals),
    meanEquity: mean(finals),
    avgMaxDrawdown,
    biggestMaxDrawdown: Math.max(...drawdowns),
    maxConsecutiveWins: Math.max(...streaks.map((s) => s.maxWins)),
    maxConsecutiveLosses: Math.max(...streaks.map((s) => s.maxLosses)),
    avgPerformance,
    returnOnMaxDrawdown:
      avgMaxDrawdown > 0 ? avgPerformance / avgMaxDrawdown : null,
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

// Fase 35 — spiegazioni dei quattro riquadri e della tabella percentili.
// Etichette con "Median" (inglese), testi in italiano come il resto dell'app.

export const probProfitInfo: MetricInfoData = {
  label: "P(in profitto)",
  description:
    "La probabilità che il percorso finisca con un'equity superiore a quella di partenza, calcolata sulla quota di linee simulate che chiudono in guadagno.",
  formula: "linee con equity finale > equity iniziale / linee totali",
};

export const medianReturnInfo: MetricInfoData = {
  label: "Median return",
  description:
    "Il ritorno del percorso «di mezzo» tra tutti quelli simulati: metà delle simulazioni fa meglio, metà fa peggio.",
  formula: "mediana dei ritorni finali · ritorno = (equity finale − iniziale) / iniziale",
};

export const medianMaxDrawdownInfo: MetricInfoData = {
  label: "Median max drawdown",
  description:
    "Il calo massimo dal picco che il percorso «di mezzo» ha sperimentato. Accanto c'è il 95° percentile: il drawdown che solo il 5% dei percorsi supera, cioè lo scenario quasi peggiore.",
  formula: "mediana dei max drawdown per percorso · DD = (picco − equity) / picco",
};

export const simulatorRuinInfo: MetricInfoData = {
  label: "Risk of ruin",
  description:
    "La probabilità che, in almeno un punto del percorso, l'equity scenda al 50% del capitale iniziale. Anche se poi risale, quel percorso conta comunque come «rovinato»: la soglia si tocca una volta sola.",
  formula: "percorsi che toccano il 50% dell'equity iniziale / percorsi totali",
};

export const percentileTableInfo: MetricInfoData = {
  label: "Scenari per percentile",
  description:
    "Come leggere le fasce: «Peggiore (5%)» = solo il 5% dei percorsi simulati va peggio di questo scenario, il 95% fa meglio. «Sfavorevole (25%)» = il 25% fa peggio, il 75% fa meglio. «Favorevole (75%)» = il 75% dei percorsi fa peggio di questo scenario, solo il 25% fa meglio. «Migliore (95%)» = il 95% fa peggio, solo il 5% fa meglio. «Median» è il percorso di mezzo (50% peggio, 50% meglio).",
  formula: "percentili 5/25/50/75/95 su equity finale, ritorno e max drawdown delle linee simulate",
};

// Fase 37 — spiegazioni delle statistiche aggregate.

export const aggregateStatsInfo: MetricInfoData = {
  label: "Statistiche aggregate",
  description:
    "Riassumono TUTTE le linee simulate insieme, mentre la tabella «Scenari per percentile» sceglie il percorso che occupa una certa posizione in classifica. Sono letture diverse dello stesso set di linee, quindi i numeri si somigliano ma rispondono a domande diverse: «Max equity» è il massimo assoluto, «Migliore (95%)» è il percorso oltre il quale sta solo il 5% dei casi. Con poche linee i due possono anche coincidere: non è un errore.",
  formula: "aggregati su tutte le N linee del grafico (nessuna simulazione separata)",
};

export const maxEquityInfo: MetricInfoData = {
  label: "Max equity",
  description:
    "L'equity finale più alta raggiunta da una qualunque delle linee simulate: il caso più fortunato osservato in questa simulazione, non un obiettivo.",
  formula: "max(equity finale) su tutte le linee",
};

export const meanEquityInfo: MetricInfoData = {
  label: "Mean equity",
  description:
    "La media delle equity finali di tutte le linee. Diversa dalla mediana della tabella percentili: qui i percorsi molto fortunati tirano su la media, là contano solo per la posizione in classifica.",
  formula: "media(equity finale) su tutte le linee",
};

export const avgMaxDrawdownInfo: MetricInfoData = {
  label: "Average max drawdown",
  description:
    "La media dei cali massimi dal picco, uno per linea: quanto in genere è profonda la buca peggiore di un percorso con questi parametri.",
  formula: "media dei max drawdown per linea · DD = (picco − equity) / picco",
};

export const biggestMaxDrawdownInfo: MetricInfoData = {
  label: "Biggest max drawdown",
  description:
    "Il calo dal picco peggiore osservato su una qualunque linea: il caso più duro comparso in questa simulazione. È la domanda «quanto può andare male» in versione worst case.",
  formula: "max dei max drawdown per linea",
};

export const maxConsecutiveWinsInfo: MetricInfoData = {
  label: "Max consecutive wins",
  description:
    "La serie di trade vincenti più lunga comparsa in una qualunque linea. Serve a ricordare che serie lunghe nascono anche dal solo caso, con la stessa win probability.",
  formula: "max, su tutte le linee, della serie di passi in salita più lunga",
};

export const maxConsecutiveLossesInfo: MetricInfoData = {
  label: "Max consecutive losses",
  description:
    "La serie di trade perdenti più lunga comparsa in una qualunque linea: il tratto peggiore che dovresti riuscire a reggere senza cambiare piano. I passi dopo l'eventuale azzeramento del conto non contano.",
  formula: "max, su tutte le linee, della serie di passi in discesa più lunga",
};

export const avgPerformanceInfo: MetricInfoData = {
  label: "Average performance",
  description:
    "La media dei ritorni finali di tutte le linee, in percentuale dell'equity di partenza.",
  formula: "media di (equity finale − iniziale) / iniziale",
};

export const returnOnMaxDrawdownInfo: MetricInfoData = {
  label: "Return on max drawdown",
  description:
    "Quanto rendimento medio produci per ogni punto di drawdown medio: un rapporto tipo Calmar. Sopra 1 il guadagno tipico supera la buca tipica; più è alto, meno sofferenza costa il risultato. Non definito se il drawdown medio è zero.",
  formula: "average performance / average max drawdown",
};

export const equitySimulatorInfo: MetricInfoData = {
  label: "Equity curve simulator",
  description:
    "Genera percorsi di equity possibili a partire da tre numeri: probabilità di vincita, rapporto vincita/perdita in R e rischio per trade (in % dell'equity corrente, quindi con compounding, o in importo fisso). Ogni linea è un futuro plausibile con quei parametri; la linea in grassetto è la media. Serve a vedere la variabilità di un edge, non a prevedere il tuo risultato.",
  formula:
    "per ogni trade: u ~ U(0,1) · esito = +ratio R se u < p, altrimenti −1 R · equity += esito × rischio",
};
