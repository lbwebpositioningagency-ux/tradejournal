/**
 * Tipi condivisi del motore metriche.
 *
 * Convenzioni del modulo (valgono per tutti i file di src/lib/metrics/):
 * - i valori monetari sono stringhe decimali; l'aritmetica usa SOLO Decimal;
 * - i tassi (win rate, drawdown %…) sono FRAZIONI 0-1 come stringhe a 4
 *   decimali ("0.5533" = 55.33%): la moltiplicazione ×100 è compito della UI;
 * - "nessun dato" → null, mai 0 spacciato per risultato;
 * - le metriche considerano solo trade CHIUSI (status CLOSED): il P&L di un
 *   trade si realizza il giorno di chiusura (`closedAt` nel fuso utente).
 */

export type TradeOutcome = "WIN" | "LOSS" | "BREAKEVEN";

/**
 * Testo informativo di una metrica per il popover <MetricInfo> (FASE 10).
 *
 * REGOLA DI MANUTENZIONE: ogni oggetto MetricInfoData vive nello STESSO file
 * della funzione che calcola il numero (es. `sortinoInfo` accanto a
 * `sortinoRatio` in sortino.ts): se la formula cambia, il testo da aggiornare
 * è sotto gli occhi di chi la tocca — mai copy scollegato altrove.
 */
export interface MetricInfoData {
  /** Nome esteso della metrica. */
  label: string;
  /** Cosa significa e perché è utile per un trader, in una frase. */
  description: string;
  /** Formula usata dal modulo di calcolo. */
  formula: string;
  /**
   * Avvertenza che dipende dai DATI del periodo (non dalla definizione della
   * metrica): es. "Indicativo: 12 trade chiusi" sotto la soglia di
   * significatività. Chi renderizza la compone e la passa; il testo statico
   * resta in description/formula.
   */
  note?: string;
}

/** Metriche che sono puri aggregati SQL (nessun modulo di formula proprio). */
export const netPnlInfo: MetricInfoData = {
  label: "Net P&L",
  description:
    "Profitto/perdita netto (fee incluse) dei trade chiusi nel periodo: il risultato economico effettivo del tuo trading.",
  formula: "Σ netPnl dei trade chiusi · netPnl = ΔPrezzo × Qty × ValorePunto − fee",
};

export const tradeCountInfo: MetricInfoData = {
  label: "Trade vincenti / perdenti",
  description:
    "Quanti trade chiusi hanno guadagnato e quanti hanno perso nel periodo (i breakeven restano fuori da entrambe le colonne).",
  formula: "Conteggio dei trade con netPnl > 0 (o < 0)",
};

export const bestWorstTradeInfo: MetricInfoData = {
  label: "Miglior vincita / peggior perdita",
  description:
    "Il singolo trade migliore e il peggiore del periodo: misura gli estremi e quanto un solo trade può spostare il bilancio.",
  formula: "max / min del netPnl dei trade chiusi",
};

export const avgTradeDurationInfo: MetricInfoData = {
  label: "Durata media",
  description:
    "Quanto tieni aperti in media i trade vincenti rispetto ai perdenti: se i perdenti durano più dei vincenti, stai lasciando correre le perdite.",
  formula: "media di (chiusura − apertura) per i trade di quel segno",
};

export const balanceInfo: MetricInfoData = {
  label: "Saldo conto",
  description:
    "Il saldo reale del conto: capitale iniziale più il P&L di TUTTO lo storico chiuso — non cambia col filtro periodo.",
  formula: "Saldo iniziale + Σ netPnl storico (tutti i trade chiusi)",
};

export const rDistributionInfo: MetricInfoData = {
  label: "Distribuzione R",
  description:
    "Quanti trade chiusi cadono in ogni fascia di mezzo R: la forma del tuo edge. Sano = perdite tagliate presto (colonne rosse compatte vicino allo zero) e vincite che si allungano a destra. Solo trade con rischio iniziale definito.",
  formula: "Conteggio trade per fascia di 0,5R · R = netPnl / rischio iniziale",
};

/** Aggregati sui trade chiusi, calcolati in SQL (una sola query). */
export interface TradeAggregates {
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** Somma dei netPnl (già al netto delle fee). */
  netPnl: string;
  /** Somma dei netPnl positivi (≥ 0). */
  winSum: string;
  /** Somma dei netPnl negativi (≤ 0, col segno). */
  lossSum: string;
  /** Somma delle fee. */
  fees: string;
  /**
   * Trade chiusi con un piano COMPLETO (stop e target entrambi pianificati):
   * numeratore del fattore disciplina dello Score.
   */
  plannedTrades: number;
  /** P&L netto dei trade senza R: quanto denaro resta fuori dall'istogramma. */
  netPnlWithoutR: string;
}

/**
 * Split degli R-multiple fra vincenti e perdenti, calcolato in SQL.
 *
 * Serve all'`Avg Win/Loss` delle tabelle di breakdown, che sta in unità R e
 * non in valuta: un rapporto fra medie in valuta non è sommabile fra conti
 * in valute diverse (v. Blocco 1 dell'audit), mentre l'R è adimensionale.
 * I trade senza rischio iniziale definito (rMultiple NULL) restano fuori da
 * entrambi i lati: sono esclusi dal numeratore come dal denominatore.
 */
export interface RSplitAggregates {
  /** Somma degli R-multiple positivi (≥ 0). */
  rWinSum: string;
  /** Trade con R > 0. */
  rWinCount: number;
  /** Somma degli R-multiple negativi (≤ 0, col segno). */
  rLossSum: string;
  /** Trade con R < 0. */
  rLossCount: number;
}

/** P&L netto di una giornata (bucketing nel fuso utente, fatto in SQL). */
export interface DailyPnl {
  /** "YYYY-MM-DD" nel fuso dell'utente */
  day: string;
  netPnl: string;
  trades: number;
}

export interface StreakResult {
  direction: "WIN" | "LOSS" | "NONE";
  length: number;
}

export interface DrawdownResult {
  /** Profondità massima del drawdown, valore positivo (scala 2). */
  maxDrawdown: string;
  /** Frazione del picco di equity (0-1, scala 4); null se il picco è ≤ 0. */
  maxDrawdownPct: string | null;
  /** Giorno ("YYYY-MM-DD") in cui il drawdown massimo è stato toccato. */
  date: string | null;
  /** Media delle profondità nei giorni in drawdown (scala 2); "0.00" se mai. */
  avgDrawdown: string;
}
