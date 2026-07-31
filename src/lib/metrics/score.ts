import Decimal from "decimal.js";
import { profitFactor } from "./profit-factor";
import { avgLoss, avgWin, payoffRatio } from "./averages";
import type { MetricInfoData } from "./types";

/**
 * SCORE a 6 fattori per il radar chart (sostituisce il compositeScore a 3
 * componenti del F35).
 *
 * Sei fattori, ognuno normalizzato 0-100, combinati a PESO UGUALE (100/6
 * ciascuno): è la scelta di partenza esplicita — senza un motivo per pesare
 * diversamente, ogni peso diverso sarebbe arbitrario due volte. Da tarare
 * eventualmente dopo aver visto i punteggi reali su SIM1 e sui conti veri.
 *
 * Normalizzazioni (i tetti riusano i precedenti del progetto dove esistono):
 * - WIN %: winRate / 60% — il 60%+ vale il massimo (stesso tetto del
 *   vecchio Day Win, DAY_WIN_CEILING: un win rate oltre il 60% non rende
 *   il sistema "più sano" in proporzione, dipende dal payoff).
 * - PROFIT FACTOR: PF / 2.5 (tetto storico PF_CEILING). Nessuna perdita:
 *   100 se c'è almeno un profitto, 0 se solo breakeven.
 * - AVG WIN/LOSS (payoff ratio): rapporto / 2.0 — vincita media doppia
 *   della perdita media = massimo. Nessuna perdita: come sopra. Nessuna
 *   vincita: 0.
 * - RECOVERY FACTOR: profitto netto / max drawdown ($), / 3.0 — recuperare
 *   3 volte la buca peggiore vale il massimo. Profitto ≤ 0 → 0. Zero
 *   drawdown: 100 con profitto, 0 senza.
 * - MAX DRAWDOWN: 1 − maxDD% / 20% (tetto storico DD_CEILING: un calo
 *   ≥ 20% del picco vale 0; drawdown più basso = punteggio più alto).
 *   Percentuale non definibile (picco ≤ 0) → 50 neutro.
 * - CONSISTENCY: 1 − (miglior GIORNATA / somma delle giornate positive) —
 *   quanto il risultato è distribuito nel tempo invece che concentrato:
 *   tutto il profitto in un giorno solo vale 0, profitto spalmato su molte
 *   giornate tende a 100. Stessa domanda della "Concentrazione top-N" di
 *   /analytics, ma sulle GIORNATE (serie già in dashboard) e ridotta a un
 *   numero. Nessuna giornata positiva → 0.
 *
 * CAUTELA STATISTICA: sotto SCORE_MIN_TRADES trade chiusi (30, la stessa
 * soglia di significatività di SQN e Optimal f) il risultato è marcato
 * `lowSample`: la UI lo dichiara invece di mostrare un numero netto
 * calcolato su un campione che non lo regge.
 *
 * Zero trade chiusi → null (nessun punteggio finto).
 */

export interface RadarScoreInput {
  total: number;
  wins: number;
  losses: number;
  /** Somma dei netPnl positivi (lordo vincite). */
  winSum: string;
  /** Somma dei netPnl negativi (≤ 0, col segno). */
  lossSum: string;
  /** P&L netto del periodo. */
  netPnl: string;
  /** Max drawdown in valuta (≥ 0) dalla curva giornaliera. */
  maxDrawdown: string;
  /** Frazione 0-1 (da maxDrawdown().maxDrawdownPct); null = non definibile. */
  maxDrawdownPct: string | null;
  /** Serie giornaliera del periodo (per la consistency). */
  daily: { netPnl: string }[];
}

/** Stessa soglia di significatività di SQN/Optimal f (30 trade). */
export const SCORE_MIN_TRADES = 30;

const WIN_RATE_CEILING = new Decimal("0.60");
const PF_CEILING = new Decimal("2.5");
const PAYOFF_CEILING = new Decimal("2.0");
const RECOVERY_CEILING = new Decimal("3.0");
const DD_CEILING = new Decimal("0.20");

/** Ordine degli assi del radar (senso orario dal vertice in alto). */
export const SCORE_FACTOR_KEYS = [
  "winRate",
  "profitFactor",
  "avgWinLoss",
  "recoveryFactor",
  "maxDrawdown",
  "consistency",
] as const;
export type ScoreFactorKey = (typeof SCORE_FACTOR_KEYS)[number];

export const SCORE_FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  winRate: "Win %",
  profitFactor: "Profit factor",
  avgWinLoss: "Avg win/loss",
  recoveryFactor: "Recovery factor",
  maxDrawdown: "Max drawdown",
  consistency: "Consistency",
};

/** Fattori normalizzati 0-100 (display: assi del radar). */
export type RadarScoreFactors = Record<ScoreFactorKey, number>;

export interface RadarScore {
  /** 0-100 con due decimali. */
  score: string;
  factors: RadarScoreFactors;
  /** true sotto SCORE_MIN_TRADES: il numero va presentato come indicativo. */
  lowSample: boolean;
  total: number;
}

function clamp01(value: Decimal): Decimal {
  if (value.lt(0)) return new Decimal(0);
  if (value.gt(1)) return new Decimal(1);
  return value;
}

/** Frazione 0-1 → punteggio 0-100 arrotondato al display (2 decimali). */
function toFactor(fraction: Decimal): number {
  return clamp01(fraction).times(100).toDecimalPlaces(2).toNumber();
}

export function radarScore(input: RadarScoreInput): RadarScore | null {
  if (input.total === 0) return null;

  // WIN %
  const winRateFraction = new Decimal(input.wins).div(input.total);
  const winRateScore = winRateFraction.div(WIN_RATE_CEILING);

  // PROFIT FACTOR
  const pf = profitFactor(input.winSum, input.lossSum);
  const pfScore =
    pf === null
      ? input.wins > 0
        ? new Decimal(1)
        : new Decimal(0)
      : new Decimal(pf).div(PF_CEILING);

  // AVG WIN/LOSS (payoff ratio)
  const aWin = avgWin(input.winSum, input.wins);
  const aLoss = avgLoss(input.lossSum, input.losses);
  const payoff = payoffRatio(aWin, aLoss);
  const payoffScore =
    payoff !== null
      ? new Decimal(payoff).div(PAYOFF_CEILING)
      : aWin !== null
        ? new Decimal(1) // vincite senza perdite
        : new Decimal(0); // nessuna vincita

  // RECOVERY FACTOR: profitto netto / max drawdown ($)
  const net = new Decimal(input.netPnl);
  const dd = new Decimal(input.maxDrawdown);
  const recoveryScore = net.lte(0)
    ? new Decimal(0)
    : dd.isZero()
      ? new Decimal(1)
      : net.div(dd).div(RECOVERY_CEILING);

  // MAX DRAWDOWN
  const ddScore =
    input.maxDrawdownPct === null
      ? new Decimal("0.5")
      : new Decimal(1).minus(new Decimal(input.maxDrawdownPct).div(DD_CEILING));

  // CONSISTENCY: 1 − miglior giornata / somma giornate positive
  let bestDay = new Decimal(0);
  let positiveDaysSum = new Decimal(0);
  for (const day of input.daily) {
    const pnl = new Decimal(day.netPnl);
    if (pnl.gt(0)) {
      positiveDaysSum = positiveDaysSum.plus(pnl);
      if (pnl.gt(bestDay)) bestDay = pnl;
    }
  }
  const consistencyScore = positiveDaysSum.isZero()
    ? new Decimal(0)
    : new Decimal(1).minus(bestDay.div(positiveDaysSum));

  const factors: RadarScoreFactors = {
    winRate: toFactor(winRateScore),
    profitFactor: toFactor(pfScore),
    avgWinLoss: toFactor(payoffScore),
    recoveryFactor: toFactor(recoveryScore),
    maxDrawdown: toFactor(ddScore),
    consistency: toFactor(consistencyScore),
  };

  // Peso uguale: 100/6 per fattore — media aritmetica dei sei, in Decimal
  // sulle frazioni clampate (non sui numeri display già arrotondati).
  const score = [
    winRateScore,
    pfScore,
    payoffScore,
    recoveryScore,
    ddScore,
    consistencyScore,
  ]
    .reduce((acc, f) => acc.plus(clamp01(f)), new Decimal(0))
    .div(6)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    score: score.toFixed(2),
    factors,
    lowSample: input.total < SCORE_MIN_TRADES,
    total: input.total,
  };
}

/** Testo per l'icona (i) accanto al titolo del widget. */
export const scoreInfo: MetricInfoData = {
  label: "Score",
  description:
    "Indice composito 0-100 dello stato del tuo trading: sei fattori (win rate, profit factor, avg win/loss, recovery factor, max drawdown, consistency), ognuno normalizzato 0-100 e combinato a peso uguale. Il radar mostra dove il sistema è forte e dove no; il numero riassume. Sotto 30 trade il punteggio è indicativo.",
  formula:
    "Score = media dei 6 fattori (peso 100/6 ciascuno) · Win%/60 · PF/2.5 · payoff/2.0 · (netto/maxDD)/3 · 1−maxDD%/20% · 1−miglior giornata/giornate positive",
};
