import Decimal from "decimal.js";
import { profitFactor } from "./profit-factor";

/**
 * Score composito 0-100 (l'equivalente dello "Zella Score").
 *
 * Media pesata di tre componenti, ognuna normalizzata 0-1:
 *
 *   Score = 100 × (0.40 × profittabilità + 0.30 × risk + 0.30 × consistenza)
 *
 * - PROFITTABILITÀ (40%): Profit Factor scalato — PF/2.5, clampato a 0-1.
 *   Un PF di 2.5+ vale il massimo; PF 1.0 (pareggio) vale 0.4; nessuna
 *   perdita con almeno un profitto = 1.0 (PF "infinito").
 * - RISK MANAGEMENT (30%): 1 − maxDrawdownPct/0.20, clampato a 0-1.
 *   Nessun drawdown = 1.0; un drawdown ≥ 20% del picco di equity = 0.
 *   Se la percentuale non è definibile (picco di equity ≤ 0) → 0.5 neutro.
 * - CONSISTENZA (30%): Day Win Rate scalato — dayWinRate/0.60, clampato.
 *   Il 60%+ di giornate verdi vale il massimo.
 *
 * Pesi scelti privilegiando la profittabilità ma senza permettere che un
 * conto profittevole con drawdown selvaggi o pochi giorni verdi faccia
 * comunque un punteggio alto. Zero trade chiusi → null.
 */

export interface ScoreInput {
  total: number;
  wins: number;
  losses: number;
  winSum: string;
  lossSum: string;
  /** Frazione 0-1 (da maxDrawdown().maxDrawdownPct). */
  maxDrawdownPct: string | null;
  /** Frazione 0-1 (da winRate() sulle giornate). */
  dayWinRate: string | null;
}

const WEIGHTS = { profitability: 0.4, risk: 0.3, consistency: 0.3 } as const;
const PF_CEILING = new Decimal("2.5");
const DD_CEILING = new Decimal("0.20");
const DAY_WIN_CEILING = new Decimal("0.60");

function clamp01(value: Decimal): Decimal {
  if (value.lt(0)) return new Decimal(0);
  if (value.gt(1)) return new Decimal(1);
  return value;
}

/** Le tre componenti dello Score come frazioni 0-1 (F35: mostrate come barre). */
export interface ScoreParts {
  score: number;
  /** Frazioni 0-1, scala 4. */
  profitability: string;
  risk: string;
  consistency: string;
}

export function compositeScoreParts(input: ScoreInput): ScoreParts | null {
  if (input.total === 0) return null;

  // Profittabilità
  let profitability: Decimal;
  const pf = profitFactor(input.winSum, input.lossSum);
  if (pf === null) {
    // Nessuna perdita: massimo se c'è almeno un profitto, zero altrimenti
    // (solo breakeven).
    profitability = input.wins > 0 ? new Decimal(1) : new Decimal(0);
  } else {
    profitability = clamp01(new Decimal(pf).div(PF_CEILING));
  }

  // Risk management
  const risk =
    input.maxDrawdownPct === null
      ? new Decimal("0.5")
      : clamp01(new Decimal(1).minus(new Decimal(input.maxDrawdownPct).div(DD_CEILING)));

  // Consistenza
  const consistency =
    input.dayWinRate === null
      ? new Decimal(0)
      : clamp01(new Decimal(input.dayWinRate).div(DAY_WIN_CEILING));

  const score = profitability
    .times(WEIGHTS.profitability)
    .plus(risk.times(WEIGHTS.risk))
    .plus(consistency.times(WEIGHTS.consistency))
    .times(100);

  return {
    score: score.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    profitability: profitability.toFixed(4),
    risk: risk.toFixed(4),
    consistency: consistency.toFixed(4),
  };
}

export function compositeScore(input: ScoreInput): number | null {
  return compositeScoreParts(input)?.score ?? null;
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi types.ts). */
export const scoreInfo = {
  label: "Score",
  description:
    "Indice composito 0-100 dello stato del tuo trading: combina profittabilità, controllo del rischio e consistenza in un solo numero confrontabile nel tempo.",
  formula: "Score = 40% profittabilità (PF/2.5) + 30% rischio (1 − MaxDD%/20%) + 30% consistenza (DayWin%/60%)",
};
