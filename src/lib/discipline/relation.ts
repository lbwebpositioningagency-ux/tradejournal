import Decimal from "decimal.js";
import { mondayOf } from "@/lib/period";
import { RULE_CATALOG, type DisciplineRuleType, type EffectiveRule } from "./catalog";
import type { DayEvaluation } from "./evaluate";

/**
 * COMPORTAMENTO → RENDIMENTI — modulo puro (Progress Tracker, fase 4).
 *
 * Mostra ASSOCIAZIONI osservate fra disciplina e P&L, mai cause. Tre letture:
 * giornate e settimane con e senza violazioni, le due serie settimanali sullo
 * stesso asse, e il P&L medio delle giornate in cui ogni regola è stata
 * violata contro quelle in cui è stata rispettata.
 *
 * DUE SCELTE DI METODO, dichiarate anche in pagina:
 *
 * 1. Le regole DEFINITE SUL RISULTATO (`outcomeBased` nel catalogo: perdita
 *    entro lo stop, perdita per trade e giornaliera, perdite consecutive) non
 *    entrano nel punteggio usato per i confronti. Una giornata che viola
 *    «perdita massima giornaliera» è in perdita per definizione: metterla fra
 *    le giornate «indisciplinate» e scoprire che rendono meno è una tautologia,
 *    non un'osservazione. Il confronto usa il punteggio sulle sole regole
 *    d'INGRESSO; nella tabella per regola quelle sul risultato restano
 *    visibili ma senza cifre.
 *
 * 2. Le regole d'ingresso si attribuiscono al giorno di APERTURA, il P&L al
 *    giorno di CHIUSURA: un trade overnight lega il comportamento di un
 *    giorno al risultato del successivo. Con trade intraday le due giornate
 *    coincidono.
 *
 * Campione: sotto `RELATION_MIN_DAYS` giornate (o `RELATION_MIN_WEEKS`
 * settimane) PER GRUPPO il confronto non si mostra come numero: si dichiara
 * che non basta.
 */

/** Giornate minime per ciascuno dei due gruppi di un confronto. */
export const RELATION_MIN_DAYS = 20;
/** Settimane minime per ciascuno dei due gruppi di un confronto. */
export const RELATION_MIN_WEEKS = 8;

export function isEntryRule(type: DisciplineRuleType): boolean {
  return !RULE_CATALOG[type].outcomeBased;
}

/** Regole attive che entrano nel confronto (solo d'ingresso). */
export function entryRules(rules: EffectiveRule[]): DisciplineRuleType[] {
  return rules.filter((r) => r.isActive && isEntryRule(r.type)).map((r) => r.type);
}

interface EntryCount {
  respected: number;
  applicable: number;
}

function entryCount(e: DayEvaluation, types: DisciplineRuleType[]): EntryCount {
  let respected = 0;
  let applicable = 0;
  for (const t of types) {
    const s = e.results[t];
    if (s === "respected") respected++;
    if (s === "respected" || s === "violated") applicable++;
  }
  return { respected, applicable };
}

export interface GroupStats {
  n: number;
  /** P&L netto medio del gruppo (scala 2); null se il gruppo è vuoto. */
  meanPnl: string | null;
  totalPnl: string;
}

function group(values: string[]): GroupStats {
  const total = values.reduce((acc, v) => acc.plus(v), new Decimal(0));
  return {
    n: values.length,
    meanPnl: values.length === 0 ? null : total.div(values.length).toFixed(2),
    totalPnl: total.toFixed(2),
  };
}

export interface Comparison {
  /** Senza violazioni delle regole d'ingresso. */
  clean: GroupStats;
  /** Con almeno una violazione. */
  violated: GroupStats;
  /** Media delle «pulite» meno media delle «con violazioni» (scala 2); null se un gruppo è vuoto. */
  difference: string | null;
  /** Entrambi i gruppi raggiungono il minimo. */
  enough: boolean;
  min: number;
}

function compare(clean: string[], violated: string[], min: number): Comparison {
  const a = group(clean);
  const b = group(violated);
  return {
    clean: a,
    violated: b,
    difference: a.meanPnl !== null && b.meanPnl !== null ? new Decimal(a.meanPnl).minus(b.meanPnl).toFixed(2) : null,
    enough: a.n >= min && b.n >= min,
    min,
  };
}

/** Giornate con almeno una regola d'ingresso applicabile, divise in pulite / con violazioni. */
export function compareDays(evaluations: DayEvaluation[], rules: EffectiveRule[]): Comparison {
  const types = entryRules(rules);
  const clean: string[] = [];
  const violated: string[] = [];
  for (const e of evaluations) {
    const c = entryCount(e, types);
    if (c.applicable === 0) continue;
    (c.respected === c.applicable ? clean : violated).push(e.netPnl);
  }
  return compare(clean, violated, RELATION_MIN_DAYS);
}

export interface WeekPoint {
  /** Lunedì della settimana, "YYYY-MM-DD". */
  week: string;
  respected: number;
  applicable: number;
  /** Punteggio sulle regole d'ingresso (scala 6); null se nessuna applicabile. */
  score: string | null;
  netPnl: string;
}

/** Serie settimanale: punteggio d'ingresso e P&L delle giornate valutate. */
export function weeklySeries(evaluations: DayEvaluation[], rules: EffectiveRule[]): WeekPoint[] {
  const types = entryRules(rules);
  const weeks = new Map<string, { respected: number; applicable: number; pnl: Decimal }>();
  for (const e of evaluations) {
    const key = mondayOf(e.day);
    const w = weeks.get(key) ?? { respected: 0, applicable: 0, pnl: new Decimal(0) };
    const c = entryCount(e, types);
    w.respected += c.respected;
    w.applicable += c.applicable;
    w.pnl = w.pnl.plus(e.netPnl);
    weeks.set(key, w);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({
      week,
      respected: w.respected,
      applicable: w.applicable,
      score: w.applicable === 0 ? null : new Decimal(w.respected).div(w.applicable).toFixed(6),
      netPnl: w.pnl.toFixed(2),
    }));
}

/** Settimane senza violazioni delle regole d'ingresso contro settimane con almeno una. */
export function compareWeeks(series: WeekPoint[]): Comparison {
  const clean: string[] = [];
  const violated: string[] = [];
  for (const w of series) {
    if (w.applicable === 0) continue;
    (w.respected === w.applicable ? clean : violated).push(w.netPnl);
  }
  return compare(clean, violated, RELATION_MIN_WEEKS);
}

export interface RuleCost {
  type: DisciplineRuleType;
  /** Regola definita sul risultato: nessun confronto, sarebbe circolare. */
  circular: boolean;
  respected: GroupStats;
  violated: GroupStats;
  /** Media delle giornate con violazione meno media di quelle rispettate (scala 2). */
  difference: string | null;
  enough: boolean;
}

/** P&L medio delle giornate con la regola violata contro quelle rispettata, per ogni regola attiva. */
export function costPerRule(evaluations: DayEvaluation[], rules: EffectiveRule[]): RuleCost[] {
  return rules
    .filter((r) => r.isActive)
    .map((rule) => {
      const respected: string[] = [];
      const violated: string[] = [];
      for (const e of evaluations) {
        const s = e.results[rule.type];
        if (s === "respected") respected.push(e.netPnl);
        if (s === "violated") violated.push(e.netPnl);
      }
      const r = group(respected);
      const v = group(violated);
      return {
        type: rule.type,
        circular: !isEntryRule(rule.type),
        respected: r,
        violated: v,
        difference: r.meanPnl !== null && v.meanPnl !== null ? new Decimal(v.meanPnl).minus(r.meanPnl).toFixed(2) : null,
        enough: r.n >= RELATION_MIN_DAYS && v.n >= RELATION_MIN_DAYS,
      };
    });
}
