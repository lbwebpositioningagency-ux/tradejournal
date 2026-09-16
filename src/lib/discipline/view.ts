import Decimal from "decimal.js";
import { formatNumber } from "@/lib/format-number";
import { SESSION_LABELS } from "@/lib/sessions";
import type { EffectiveRule } from "./catalog";
import type { DayEvaluation } from "./evaluate";

/**
 * Pezzi puri della VISTA del Progress Tracker: gradini della heatmap, testo
 * della condizione di ogni regola, mesi del periodo. Nessuna formula di
 * valutazione qui (stanno in `evaluate.ts`).
 */

/**
 * Gradino della heatmap della disciplina (tavola «Progress Tracker -
 * disposizione e heatmap», scelta 2c): l'intensità cresce col punteggio.
 * 100% → 3 · da 50% → 2 · sotto 50% → 1 · nessuna regola applicabile → 0.
 * Su SIM1 l'87% delle giornate è perfetto: per questo le giornate con una
 * violazione portano anche un segno e la frazione in cifre, non solo la tinta.
 */
export function disciplineTier(score: string | null): 0 | 1 | 2 | 3 {
  if (score === null) return 0;
  const value = new Decimal(score);
  if (value.gte(1)) return 3;
  if (value.gte("0.5")) return 2;
  return 1;
}

/** Classi di sfondo per gradino (stringhe letterali perché Tailwind le trovi). */
export const DISCIPLINE_TONES = ["", "bg-heat-rule-1", "bg-heat-rule-2", "bg-heat-rule-3"] as const;

const money = (amount: string, currency: string) =>
  `${formatNumber(amount, { decimals: new Decimal(amount).isInteger() ? 0 : 2 })} ${currency}`;

const r = (value: string | null) => formatNumber(value ?? "0", { maxDecimals: 4 });

/** La condizione di una regola, in parole, con le soglie nella valuta attiva. */
export function ruleCondition(rule: EffectiveRule, currency: string): string {
  const limit = rule.currencyLimits.find((l) => l.currency === currency);
  const noLimit = `Nessuna soglia in ${currency}`;
  switch (rule.type) {
    case "STOP_PRESENT":
      return "Stop valido su ogni trade aperto";
    case "STOP_RESPECTED":
      return `Uscita in perdita non oltre ${r(new Decimal(rule.rValue ?? "0").plus(1).toString())}R dallo stop`;
    case "MAX_LOSS_PER_TRADE":
      return limit ? `Perdita fino a ${money(limit.amount, currency)} a trade` : noLimit;
    case "MAX_DAILY_LOSS":
      return limit ? `Perdita fino a ${money(limit.amount, currency)} al giorno` : noLimit;
    case "MAX_TRADES_PER_DAY":
      return `Al massimo ${rule.countValue} aperture al giorno`;
    case "MAX_PLANNED_RISK":
      return limit ? `Rischio pianificato fino a ${money(limit.amount, currency)}` : noLimit;
    case "MIN_TARGET_R":
      return `R/R pianificato almeno ${r(rule.rValue)}`;
    case "TRADING_HOURS":
      return `${rule.sessions.map((s) => SESSION_LABELS[s]).join(" · ")}${rule.allowWeekend ? ", anche nel weekend" : ", non nel weekend"}`;
    case "COOLDOWN_AFTER_LOSS":
      return `Pausa di ${rule.minutesValue} minuti dopo una perdita`;
    case "MAX_CONSECUTIVE_LOSSES":
      return `Al massimo ${rule.countValue} perdite di fila nel giorno`;
    case "MAX_OPEN_POSITIONS":
      return `Al massimo ${rule.countValue} posizioni aperte insieme`;
    case "MAX_QUANTITY_PER_SYMBOL":
      return rule.symbolLimits.length === 0
        ? "Nessun simbolo con una soglia"
        : rule.symbolLimits.map((l) => `${l.symbol} fino a ${formatNumber(l.quantity, { maxDecimals: 8 })}`).join(" · ");
  }
}

/** Mesi "YYYY-MM" che hanno giornate valutate, dal più recente. */
export function monthsNewestFirst(evaluations: DayEvaluation[]): string[] {
  return [...new Set(evaluations.map((e) => e.day.slice(0, 7)))].sort().reverse();
}

/** "2026-07" → "Luglio 2026". */
export function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "2026-07-28" → "28/07". */
export function shortDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** "2026-07-28" → "28 luglio 2026" (etichette accessibili delle celle). */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}
