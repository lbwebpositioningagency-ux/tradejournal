/*
 * Id, etichette e TIPI della dashboard — modulo SENZA zod (P-02): è importato
 * dal client component dashboard-view, e lo schema del layout qui dentro
 * trascinava zod nel chunk condiviso di 11 route. Gli schemi e il parse
 * vivono in lib/validations/dashboard.ts (solo server).
 */

/** Modalità di visualizzazione dei valori nella dashboard. */
export const VIEW_MODES = ["dollars", "percent", "r", "privacy"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  dollars: "$",
  percent: "%",
  r: "R",
  privacy: "Privacy",
};

/** Id dei widget della dashboard, nell'ordine di rendering. */
export const WIDGET_IDS = [
  "net-pnl",
  "win-rate",
  "profit-factor",
  "day-win-rate",
  "avg-win-loss",
  "expectancy",
  "max-drawdown",
  "streaks",
  "sortino",
  "calmar",
  "sqn",
  "ulcer",
  "mini-calendar",
  "open-positions",
  "trade-sequence",
  "r-distribution",
  "winners-losers",
  "best-worst-days",
  "sessions",
  "score",
  "cumulative",
  "underwater",
  "daily-pnl",
  "balance",
  "recent-trades",
  "monthly-calendar",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  "net-pnl": "Net P&L",
  "win-rate": "Trade Win %",
  "profit-factor": "Profit Factor",
  "day-win-rate": "Day Win %",
  "avg-win-loss": "Avg Win / Loss",
  expectancy: "Expectancy",
  "max-drawdown": "Max Drawdown",
  streaks: "Streak correnti",
  sortino: "Sortino Ratio",
  calmar: "Calmar Ratio",
  sqn: "SQN",
  ulcer: "Ulcer Index",
  "mini-calendar": "Calendario del mese (mobile)",
  "open-positions": "Posizioni aperte",
  "trade-sequence": "Sequenza trade",
  "r-distribution": "Distribuzione R",
  "winners-losers": "Winners & Losers",
  "best-worst-days": "Best/Worst Days",
  sessions: "Performance per sessione",
  score: "Score",
  cumulative: "P&L cumulativo",
  underwater: "Underwater plot",
  "daily-pnl": "P&L giornaliero",
  balance: "Saldo conto",
  "recent-trades": "Ultimi trade",
  "monthly-calendar": "Calendario mensile",
};

/**
 * F26 — stato dei toggle del layout MOBILE (metriche secondarie e analytics
 * collassate sotto lg), persistito con chiave separata: il desktop non li usa.
 */
export interface MobileLayout {
  showAllMetrics: boolean;
  showAnalytics: boolean;
}

export const MOBILE_LAYOUT_DEFAULTS: MobileLayout = {
  showAllMetrics: false,
  showAnalytics: false,
};

/** Contenuto di `User.dashboardLayout` (Json), già validato dal server. */
export interface DashboardLayout {
  hidden: WidgetId[];
  mobile: MobileLayout;
}
