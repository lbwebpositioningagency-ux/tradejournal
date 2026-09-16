import Decimal from "decimal.js";
import {
  RULE_CATALOG,
  type DisciplineRuleType,
  type EffectiveRule,
  type RuleSession,
} from "./catalog";

/**
 * VALUTAZIONE GIORNALIERA DELLA DISCIPLINA — modulo puro.
 *
 * Il database riduce i trade a FATTI per giornata (`DayFacts`, query in
 * `lib/queries/discipline.ts`): conteggi, minimi e massimi che non dipendono
 * da nessuna soglia. Qui le soglie dell'utente si applicano ai fatti e ogni
 * regola attiva, ogni giornata, diventa rispettata / violata / non
 * applicabile. Così le formule si testano senza database e una soglia
 * cambiata non richiede di rileggere i trade.
 *
 * Tutti i confronti in Decimal: importi, R e quantità arrivano come stringhe.
 */

export type RuleStatus = "respected" | "violated" | "na";

/** Fatti di UNA giornata operativa (nel fuso dell'utente), già ristretti a una valuta. */
export interface DayFacts {
  /** "YYYY-MM-DD" nel fuso dell'utente. */
  day: string;

  // ── Giorno di APERTURA ──
  /** Trade aperti (anche ancora aperti). */
  opened: number;
  /** Aperti senza uno stop valido (assente, uguale all'ingresso o dal lato sbagliato). */
  missingStop: number;
  /** Rischio pianificato massimo fra gli aperti con rischio > 0; null se nessuno. */
  maxPlannedRisk: string | null;
  /** R/R pianificato minimo fra gli aperti con stop e target validi; null se nessuno. */
  minTargetR: string | null;
  /** Aperture per sessione (ora italiana). */
  openedBySession: Record<RuleSession, number>;
  /** Almeno un'apertura segue una perdita chiusa lo stesso giorno. */
  lossBeforeOpenSameDay: boolean;
  /** Minuti minimi fra la chiusura in perdita più recente e un'apertura; null se nessuna perdita precede. */
  minMinutesAfterLoss: string | null;
  /** Posizioni aperte insieme, al massimo, al momento di un'apertura (compresa la nuova). */
  maxOpenPositions: number;
  /** Quantità massima aperta per simbolo. */
  maxQuantityBySymbol: Record<string, string>;

  // ── Giorno di CHIUSURA ──
  /** Trade chiusi. */
  closed: number;
  /** P&L netto dei chiusi. */
  netPnl: string;
  /** P&L netto del trade peggiore chiuso; null se nessuno. */
  worstTradeNet: string | null;
  /** Chiusi in perdita con uno stop valido. */
  lossesWithStop: number;
  /** R realizzato sui prezzi più basso fra quelli; null se nessuno. */
  worstLossPriceR: string | null;
  /** Serie più lunga di chiusi in perdita uno dopo l'altro. */
  maxConsecutiveLosses: number;
}

/** Sabato o domenica, per la data locale "YYYY-MM-DD". */
export function isWeekendDay(day: string): boolean {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function limitFor(
  rule: EffectiveRule,
  currency: string | undefined,
): Decimal | null {
  if (!currency) return null;
  const limit = rule.currencyLimits.find((l) => l.currency === currency);
  return limit ? new Decimal(limit.amount) : null;
}

/**
 * Stato di UNA regola in UNA giornata. `currency` è la valuta dei fatti: le
 * soglie in denaro si leggono solo in quella valuta.
 */
export function evaluateRule(
  rule: EffectiveRule,
  facts: DayFacts,
  currency: string | undefined,
): RuleStatus {
  const verdict = (violated: boolean): RuleStatus => (violated ? "violated" : "respected");

  switch (rule.type) {
    case "STOP_PRESENT":
      // Stop mancante = violazione (decisione del 16/09/2026), anche se la
      // causa può essere l'import MT5: la nota della regola lo dice.
      return facts.opened === 0 ? "na" : verdict(facts.missingStop > 0);

    case "STOP_RESPECTED": {
      // Senza perdite con stop non c'è stop da rispettare: giornata non
      // applicabile, non «rispettata» (coerente con la Disciplina dello Score).
      if (facts.lossesWithStop === 0 || facts.worstLossPriceR === null) return "na";
      const tolerance = new Decimal(rule.rValue ?? "0");
      // Uscita oltre lo stop = R realizzato sui prezzi sotto −1 (plan.ts).
      return verdict(new Decimal(facts.worstLossPriceR).lt(tolerance.plus(1).neg()));
    }

    case "MAX_LOSS_PER_TRADE": {
      const limit = limitFor(rule, currency);
      if (limit === null || facts.closed === 0 || facts.worstTradeNet === null) return "na";
      return verdict(new Decimal(facts.worstTradeNet).lt(limit.neg()));
    }

    case "MAX_DAILY_LOSS": {
      const limit = limitFor(rule, currency);
      if (limit === null || facts.closed === 0) return "na";
      return verdict(new Decimal(facts.netPnl).lt(limit.neg()));
    }

    case "MAX_TRADES_PER_DAY":
      if (facts.opened === 0 || rule.countValue === null) return "na";
      return verdict(facts.opened > rule.countValue);

    case "MAX_PLANNED_RISK": {
      const limit = limitFor(rule, currency);
      if (limit === null || facts.maxPlannedRisk === null) return "na";
      return verdict(new Decimal(facts.maxPlannedRisk).gt(limit));
    }

    case "MIN_TARGET_R":
      if (facts.minTargetR === null || rule.rValue === null) return "na";
      return verdict(new Decimal(facts.minTargetR).lt(rule.rValue));

    case "TRADING_HOURS": {
      if (facts.opened === 0) return "na";
      const outside = (Object.keys(facts.openedBySession) as RuleSession[]).some(
        (s) => facts.openedBySession[s] > 0 && !rule.sessions.includes(s),
      );
      const weekend = !rule.allowWeekend && isWeekendDay(facts.day);
      return verdict(outside || weekend);
    }

    case "COOLDOWN_AFTER_LOSS": {
      if (facts.opened === 0 || rule.minutesValue === null) return "na";
      const violated =
        facts.minMinutesAfterLoss !== null &&
        new Decimal(facts.minMinutesAfterLoss).lt(rule.minutesValue);
      if (violated) return "violated";
      // Rispettata solo se c'era una perdita da cui fare pausa.
      return facts.lossBeforeOpenSameDay ? "respected" : "na";
    }

    case "MAX_CONSECUTIVE_LOSSES":
      if (facts.closed === 0 || rule.countValue === null) return "na";
      return verdict(facts.maxConsecutiveLosses > rule.countValue);

    case "MAX_OPEN_POSITIONS":
      if (facts.opened === 0 || rule.countValue === null) return "na";
      return verdict(facts.maxOpenPositions > rule.countValue);

    case "MAX_QUANTITY_PER_SYMBOL": {
      let applicable = false;
      let violated = false;
      for (const { symbol, quantity } of rule.symbolLimits) {
        const opened = facts.maxQuantityBySymbol[symbol];
        if (opened === undefined) continue;
        applicable = true;
        if (new Decimal(opened).gt(quantity)) violated = true;
      }
      return applicable ? verdict(violated) : "na";
    }
  }
}

export interface DayEvaluation {
  day: string;
  results: Partial<Record<DisciplineRuleType, RuleStatus>>;
  respected: number;
  applicable: number;
  /** Rispettate / applicabili (scala 6); null se nessuna regola era applicabile. */
  score: string | null;
  netPnl: string;
}

/** Valuta le regole ATTIVE su ogni giornata operativa (ordine cronologico). */
export function evaluateDays(
  days: DayFacts[],
  rules: EffectiveRule[],
  currency: string | undefined,
): DayEvaluation[] {
  const active = rules.filter((r) => r.isActive);
  return [...days]
    .filter((d) => d.opened > 0 || d.closed > 0)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((facts) => {
      const results: Partial<Record<DisciplineRuleType, RuleStatus>> = {};
      let respected = 0;
      let applicable = 0;
      for (const rule of active) {
        const status = evaluateRule(rule, facts, currency);
        results[rule.type] = status;
        if (status !== "na") applicable++;
        if (status === "respected") respected++;
      }
      return {
        day: facts.day,
        results,
        respected,
        applicable,
        score: applicable === 0 ? null : new Decimal(respected).div(applicable).toFixed(6),
        netPnl: facts.netPnl,
      };
    });
}

/**
 * Sotto questo numero di giornate applicabili il follow rate si dichiara poco
 * affidabile: con 20 giornate una sola giornata sposta la percentuale di 5
 * punti, e sotto quella soglia la cifra racconta il caso più che l'abitudine.
 * Stessa logica dei minimi di campione dello Score (`DISCIPLINE_MIN_LOSSES`).
 */
export const FOLLOW_RATE_MIN_DAYS = 20;

export interface RuleStats {
  type: DisciplineRuleType;
  /** Giornate consecutive rispettate, contando all'indietro dall'ultima applicabile. */
  currentStreak: number;
  /** Serie più lunga di giornate rispettate. */
  bestStreak: number;
  respectedDays: number;
  violatedDays: number;
  /** Rispettate / applicabili (scala 6); null senza giornate applicabili. */
  followRate: string | null;
  /** Giornate applicabili ≥ FOLLOW_RATE_MIN_DAYS. */
  reliable: boolean;
  /** Ultima giornata applicabile e il suo esito. */
  last: { day: string; status: Exclude<RuleStatus, "na"> } | null;
}

/**
 * Streak: le giornate NON applicabili non interrompono la serie e non la
 * allungano — una giornata senza perdite non è un merito per «Perdita entro
 * lo stop», e non è nemmeno una colpa.
 */
export function ruleStats(
  type: DisciplineRuleType,
  evaluations: DayEvaluation[],
): RuleStats {
  let run = 0;
  let best = 0;
  let respectedDays = 0;
  let violatedDays = 0;
  let last: RuleStats["last"] = null;
  for (const e of evaluations) {
    const status = e.results[type];
    if (status === undefined || status === "na") continue;
    last = { day: e.day, status };
    if (status === "respected") {
      respectedDays++;
      run++;
      best = Math.max(best, run);
    } else {
      violatedDays++;
      run = 0;
    }
  }
  const applicable = respectedDays + violatedDays;
  return {
    type,
    currentStreak: run,
    bestStreak: best,
    respectedDays,
    violatedDays,
    followRate: applicable === 0 ? null : new Decimal(respectedDays).div(applicable).toFixed(6),
    reliable: applicable >= FOLLOW_RATE_MIN_DAYS,
    last,
  };
}

export interface PeriodSummary {
  /** Giornate operative con almeno una regola applicabile. */
  days: number;
  respected: number;
  applicable: number;
  /** Punteggio del periodo: rispettate / applicabili su tutte le giornate (scala 6). */
  score: string | null;
  /** Giornate con tutte le regole applicabili rispettate. */
  perfectDays: number;
  /** Giornate perfette consecutive, dall'ultima giornata valutata all'indietro. */
  currentPerfectStreak: number;
  reliable: boolean;
}

export function summarizePeriod(evaluations: DayEvaluation[]): PeriodSummary {
  let respected = 0;
  let applicable = 0;
  let days = 0;
  let perfectDays = 0;
  let streak = 0;
  for (const e of evaluations) {
    if (e.applicable === 0) continue;
    days++;
    respected += e.respected;
    applicable += e.applicable;
    if (e.respected === e.applicable) {
      perfectDays++;
      streak++;
    } else {
      streak = 0;
    }
  }
  return {
    days,
    respected,
    applicable,
    score: applicable === 0 ? null : new Decimal(respected).div(applicable).toFixed(6),
    perfectDays,
    currentPerfectStreak: streak,
    reliable: days >= FOLLOW_RATE_MIN_DAYS,
  };
}

/** Giornate nel periodo [fromDay, toDay) — chiavi "YYYY-MM-DD" nel fuso utente. */
export function inPeriod(
  evaluations: DayEvaluation[],
  fromDay: string | undefined,
  toDayExclusive: string | undefined,
): DayEvaluation[] {
  return evaluations.filter(
    (e) => (!fromDay || e.day >= fromDay) && (!toDayExclusive || e.day < toDayExclusive),
  );
}

/** Le regole attive, con il loro catalogo, nell'ordine di configurazione. */
export function activeRuleTypes(rules: EffectiveRule[]): DisciplineRuleType[] {
  return rules.filter((r) => r.isActive).map((r) => RULE_CATALOG[r.type].type);
}
