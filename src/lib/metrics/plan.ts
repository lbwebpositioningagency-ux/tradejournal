import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * "Piano vs esito" (F16a): confronto tra il piano di trade (stop/target
 * pianificati, salvati sul trade) e quello che è successo davvero.
 *
 * Tutto è calcolato SUI PREZZI (fee escluse), così piano ed esito sono
 * confrontabili mele-con-mele: l'R monetario (netPnl / rischio iniziale)
 * resta quello canonico mostrato nel riepilogo, qui si misura la qualità
 * dell'esecuzione rispetto al piano di prezzo.
 *
 * Convenzioni (LONG; per SHORT i segni si invertono):
 *   rischio  = entry − stop      → deve essere > 0, altrimenti il piano
 *                                  non è valido (stop dal lato sbagliato)
 *   reward   = target − entry    → deve essere > 0 per un R pianificato
 *   R pianificato = reward / rischio
 *   R realizzato (prezzo) = (exit − entry) / rischio
 */

export interface PlanVsOutcomeInput {
  direction: "LONG" | "SHORT";
  /** Prezzi come stringhe decimali (Prisma Decimal → string). */
  entry: string;
  /** Prezzo medio di uscita; null se il trade è ancora aperto. */
  exit: string | null;
  plannedStop: string | null;
  plannedTarget: string | null;
}

export interface PlanVsOutcome {
  /** R pianificato (reward/rischio, scala 4); null se stop o target mancano o sono dal lato sbagliato. */
  plannedR: string | null;
  /** R realizzato sui prezzi, fee escluse (scala 4); null se trade aperto o rischio non valido. */
  realizedPriceR: string | null;
  /** Frazione del piano raggiunta: realizzato/pianificato (scala 4, negativa in perdita). */
  planCompletion: string | null;
  /** True se l'uscita è OLTRE lo stop pianificato (perdita peggiore del piano). */
  stopViolated: boolean;
  /** True se l'uscita è oltre il target pianificato (esito migliore del piano). */
  targetExceeded: boolean;
  /** True se lo stop c'è ma è dal lato sbagliato (o uguale all'entry): piano non valido. */
  stopSideInvalid: boolean;
  /** True se il target c'è ma è dal lato sbagliato (o uguale all'entry). */
  targetSideInvalid: boolean;
}

const EMPTY: PlanVsOutcome = {
  plannedR: null,
  realizedPriceR: null,
  planCompletion: null,
  stopViolated: false,
  targetExceeded: false,
  stopSideInvalid: false,
  targetSideInvalid: false,
};

function parse(value: string | null): Decimal | null {
  if (value === null) return null;
  try {
    const dec = new Decimal(value);
    return dec.isFinite() ? dec : null;
  } catch {
    return null;
  }
}

/**
 * TARGET R del piano: |target − entry| / |entry − stop|, con la direzione
 * gestita correttamente. Null se manca un prezzo o se stop/target stanno dal
 * lato sbagliato (piano non valido).
 *
 * È la STESSA quantità che `planVsOutcome` espone come `plannedR`, estratta
 * perché serve anche fuori dal dettaglio trade: viene denormalizzata su
 * `Trade.targetR` alla scrittura, esattamente come `rMultiple`, così le
 * distribuzioni per target R si aggregano in SQL senza che nessuno
 * ri-derivi la formula per conto proprio.
 */
export function targetRMultiple(
  input: Pick<PlanVsOutcomeInput, "direction" | "entry" | "plannedStop" | "plannedTarget">,
): string | null {
  return planVsOutcome({ ...input, exit: null }).plannedR;
}

export function planVsOutcome(input: PlanVsOutcomeInput): PlanVsOutcome {
  const sign = input.direction === "LONG" ? 1 : -1;
  const entry = parse(input.entry);
  if (entry === null) return EMPTY;
  const exit = parse(input.exit);
  const stop = parse(input.plannedStop);
  const target = parse(input.plannedTarget);

  // Rischio pianificato in punti prezzo, positivo se lo stop è dal lato giusto.
  const risk = stop === null ? null : entry.minus(stop).times(sign);
  const validRisk = risk !== null && risk.gt(0) ? risk : null;

  // Reward pianificato, positivo se il target è dal lato giusto.
  const reward = target === null ? null : target.minus(entry).times(sign);
  const validReward = reward !== null && reward.gt(0) ? reward : null;

  const plannedR =
    validRisk !== null && validReward !== null
      ? validReward.div(validRisk).toFixed(4)
      : null;

  const realizedPriceR =
    validRisk !== null && exit !== null
      ? exit.minus(entry).times(sign).div(validRisk).toFixed(4)
      : null;

  const planCompletion =
    plannedR !== null && realizedPriceR !== null
      ? new Decimal(realizedPriceR).div(plannedR).toFixed(4)
      : null;

  const stopViolated =
    validRisk !== null && exit !== null && stop !== null
      ? exit.minus(stop).times(sign).lt(0)
      : false;

  const targetExceeded =
    validReward !== null && exit !== null && target !== null
      ? exit.minus(target).times(sign).gt(0)
      : false;

  return {
    plannedR,
    realizedPriceR,
    planCompletion,
    stopViolated,
    targetExceeded,
    stopSideInvalid: risk !== null && validRisk === null,
    targetSideInvalid: reward !== null && validReward === null,
  };
}

/** Testi per <MetricInfo>: tenuti accanto alla formula, come sempre. */
export const plannedRInfo: MetricInfoData = {
  label: "R pianificato",
  description:
    "Il rapporto rischio/rendimento del piano: quanti multipli del rischio avresti incassato arrivando al target. Calcolato sui prezzi pianificati, prima che il trade parta.",
  formula: "R piano = |target − entry| / |entry − stop| (segni per direzione)",
};

export const realizedPriceRInfo: MetricInfoData = {
  label: "R realizzato (prezzo)",
  description:
    "Quanto hai davvero incassato in multipli del rischio pianificato, misurato sui prezzi medi di ingresso/uscita (fee escluse). Confrontalo con l'R pianificato per vedere quanto del piano hai eseguito.",
  formula: "R prezzo = (exit − entry) / (entry − stop) · LONG (inverso per SHORT)",
};

export const planCompletionInfo: MetricInfoData = {
  label: "Piano raggiunto",
  description:
    "La frazione del piano che hai portato a casa: 100% = uscita esattamente al target, negativo = trade chiuso in perdita. Misura la fedeltà dell'esecuzione, non la bontà del piano.",
  formula: "Piano % = R realizzato (prezzo) / R pianificato",
};
