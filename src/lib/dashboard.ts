import { z } from "zod";

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
  "trade-sequence",
  "winners-losers",
  "best-worst-days",
  "sessions",
  "score",
  "cumulative",
  "daily-pnl",
  "balance",
  "recent-trades",
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
  "trade-sequence": "Sequenza trade",
  "winners-losers": "Winners & Losers",
  "best-worst-days": "Best/Worst Days",
  sessions: "Performance per sessione",
  score: "Score",
  cumulative: "P&L cumulativo",
  "daily-pnl": "P&L giornaliero",
  balance: "Saldo conto",
  "recent-trades": "Ultimi trade",
};

/** Contenuto di `User.dashboardLayout` (Json). */
export const dashboardLayoutSchema = z.object({
  hidden: z.array(z.enum(WIDGET_IDS)).default([]),
});
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : { hidden: [] };
}
