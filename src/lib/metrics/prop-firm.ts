import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * F36 — tracker regole prop firm (FTMO/FundedNext/FundingPips…).
 *
 * APPROSSIMAZIONE DICHIARATA (ovunque in UI): tutti i calcoli usano il
 * cumulato dei TRADE CHIUSI per giornata nel fuso utente — l'app non ha
 * l'equity intraday né il floating P&L, quindi una violazione avvenuta e
 * rientrata DENTRO la stessa giornata non è rilevabile. È un termometro
 * onesto, non l'arbitro del broker.
 *
 * Convenzioni:
 * - le regole sono importi POSITIVI in valuta conto (limit 500 = perdita
 *   massima di 500);
 * - la violazione scatta al RAGGIUNGIMENTO del limite (>=), come nei
 *   regolamenti prop;
 * - il drawdown è storico: un giorno chiuso sotto il pavimento marca il
 *   conto come violato anche se poi ha recuperato.
 */

export type PropDrawdownType = "STATIC" | "TRAILING";

export interface PropFirmRules {
  /** Perdita massima per giornata (valuta conto), null = regola non attiva. */
  dailyLossLimit: string | null;
  /** Drawdown massimo dal riferimento (statico: saldo iniziale; trailing: picco). */
  maxDrawdown: string | null;
  drawdownType: PropDrawdownType;
  /** Obiettivo di profitto cumulato (valuta conto). */
  profitTarget: string | null;
  /** Giornate operative minime richieste. */
  minTradingDays: number | null;
}

export interface PropDailyStatus {
  /** Perdita di oggi come valore ≥ 0 (0 se il giorno è in verde). */
  lossToday: string;
  limit: string;
  /** Frazione del limite consumata oggi (scala 4, può superare 1). */
  used: string;
  /** Margine residuo prima della violazione (≥ 0). */
  remaining: string;
  breached: boolean;
}

export interface PropDrawdownStatus {
  type: PropDrawdownType;
  /** Equity di fine giornata corrente = saldo iniziale + P&L chiuso cumulato. */
  equity: string;
  /** Riferimento del drawdown: saldo iniziale (statico) o picco equity (trailing). */
  peak: string;
  /** Pavimento sotto il quale il conto è violato. */
  floor: string;
  /** Frazione del drawdown consumata ORA (scala 4, ≥ 0). */
  used: string;
  remaining: string;
  /** Violazione STORICA: almeno una chiusura di giornata a/oltre il pavimento. */
  breached: boolean;
}

export interface PropTargetStatus {
  netPnl: string;
  target: string;
  /** Frazione dell'obiettivo raggiunta (scala 4, ≥ 0, può superare 1). */
  progress: string;
  remaining: string;
  reached: boolean;
}

export interface PropDaysStatus {
  done: number;
  required: number;
  reached: boolean;
}

export interface PropFirmStatus {
  dailyLoss: PropDailyStatus | null;
  drawdown: PropDrawdownStatus | null;
  profitTarget: PropTargetStatus | null;
  tradingDays: PropDaysStatus | null;
  /** True se una qualsiasi regola di perdita è violata. */
  anyBreached: boolean;
}

function pos(value: string | null): Decimal | null {
  if (value === null) return null;
  try {
    const dec = new Decimal(value);
    return dec.isFinite() && dec.gt(0) ? dec : null;
  } catch {
    return null;
  }
}

/**
 * Stato delle regole prop di UN conto, dalla serie giornaliera COMPLETA dei
 * trade chiusi del conto (mai filtrata dal periodo) nel fuso utente.
 * null se nessuna regola è attiva.
 */
export function propFirmStatus(input: {
  rules: PropFirmRules;
  initialBalance: string;
  /** Giornate operative in ordine cronologico: {day: "YYYY-MM-DD", netPnl}. */
  daily: { day: string; netPnl: string }[];
  /** Giorno di calendario corrente nel fuso utente. */
  todayKey: string;
}): PropFirmStatus | null {
  const { rules, daily, todayKey } = input;
  const dailyLimit = pos(rules.dailyLossLimit);
  const maxDd = pos(rules.maxDrawdown);
  const target = pos(rules.profitTarget);
  const minDays =
    rules.minTradingDays !== null && rules.minTradingDays > 0
      ? rules.minTradingDays
      : null;
  if (!dailyLimit && !maxDd && !target && !minDays) return null;

  const initial = new Decimal(input.initialBalance);

  // ── Daily loss (oggi) ────────────────────────────────────────────────
  let dailyLoss: PropDailyStatus | null = null;
  if (dailyLimit) {
    const todayNet = daily.find((d) => d.day === todayKey)?.netPnl ?? "0";
    const lossToday = Decimal.max(0, new Decimal(todayNet).neg());
    const breached = lossToday.gte(dailyLimit);
    dailyLoss = {
      lossToday: lossToday.toFixed(2),
      limit: dailyLimit.toFixed(2),
      used: lossToday.div(dailyLimit).toDecimalPlaces(4).toString(),
      remaining: Decimal.max(0, dailyLimit.minus(lossToday)).toFixed(2),
      breached,
    };
  }

  // ── Equity di fine giornata e drawdown ───────────────────────────────
  let drawdown: PropDrawdownStatus | null = null;
  let equity = initial;
  if (maxDd) {
    let peak = initial;
    let breached = false;
    for (const dayRow of daily) {
      equity = equity.plus(dayRow.netPnl);
      if (rules.drawdownType === "TRAILING" && equity.gt(peak)) peak = equity;
      // Violazione storica sulla chiusura di giornata (approssimazione).
      if (peak.minus(equity).gte(maxDd)) breached = true;
    }
    const usedNow = Decimal.max(0, peak.minus(equity));
    drawdown = {
      type: rules.drawdownType,
      equity: equity.toFixed(2),
      peak: peak.toFixed(2),
      floor: peak.minus(maxDd).toFixed(2),
      used: usedNow.div(maxDd).toDecimalPlaces(4).toString(),
      remaining: Decimal.max(0, maxDd.minus(usedNow)).toFixed(2),
      breached,
    };
  } else {
    for (const dayRow of daily) equity = equity.plus(dayRow.netPnl);
  }

  // ── Profit target ────────────────────────────────────────────────────
  const lifetimeNet = equity.minus(initial);
  let profitTarget: PropTargetStatus | null = null;
  if (target) {
    profitTarget = {
      netPnl: lifetimeNet.toFixed(2),
      target: target.toFixed(2),
      progress: Decimal.max(0, lifetimeNet).div(target).toDecimalPlaces(4).toString(),
      remaining: Decimal.max(0, target.minus(lifetimeNet)).toFixed(2),
      reached: lifetimeNet.gte(target),
    };
  }

  // ── Giornate operative minime ────────────────────────────────────────
  let tradingDays: PropDaysStatus | null = null;
  if (minDays) {
    tradingDays = {
      done: daily.length,
      required: minDays,
      reached: daily.length >= minDays,
    };
  }

  return {
    dailyLoss,
    drawdown,
    profitTarget,
    tradingDays,
    anyBreached: Boolean(dailyLoss?.breached) || Boolean(drawdown?.breached),
  };
}

/** Testi per <MetricInfo>: accanto alla formula, come sempre. */
export const propDailyLossInfo: MetricInfoData = {
  label: "Daily loss limit",
  description:
    "Quanto del limite di perdita giornaliera hai consumato OGGI, sul netto dei trade chiusi in giornata nel tuo fuso. Approssimazione dichiarata: niente equity intraday né floating P&L — una violazione rientrata in giornata non è rilevabile qui.",
  formula: "Usato % = max(0, −P&L di oggi) / daily loss limit",
};

export const propDrawdownInfo: MetricInfoData = {
  label: "Max drawdown prop",
  description:
    "Distanza dal pavimento del conto: statico (saldo iniziale − max DD) o trailing (picco equity − max DD). Calcolato sulle chiusure di giornata dei trade chiusi: un conto violato resta violato anche se poi recupera.",
  formula: "Usato % = (riferimento − equity) / max DD · riferimento = saldo iniziale (statico) o picco (trailing)",
};

export const propTargetInfo: MetricInfoData = {
  label: "Profit target",
  description:
    "Avanzamento verso l'obiettivo di profitto della challenge: P&L netto cumulato di tutto lo storico chiuso del conto contro il target impostato.",
  formula: "Progresso % = max(0, Σ netPnl storico) / profit target",
};

export const propDaysInfo: MetricInfoData = {
  label: "Giornate operative",
  description:
    "Giornate con almeno un trade chiuso contro il minimo richiesto dalla challenge.",
  formula: "Giornate con ≥1 trade chiuso / giorni minimi richiesti",
};
