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
};

/**
 * F26 — stato dei toggle del layout MOBILE (metriche secondarie e analytics
 * collassate sotto lg), persistito con chiave separata: il desktop non li usa.
 */
export const mobileLayoutSchema = z.object({
  showAllMetrics: z.boolean().default(false),
  showAnalytics: z.boolean().default(false),
});
export type MobileLayout = z.infer<typeof mobileLayoutSchema>;

const MOBILE_DEFAULTS: MobileLayout = {
  showAllMetrics: false,
  showAnalytics: false,
};

/**
 * Contenuto di `User.dashboardLayout` (Json).
 *
 * `hidden` accetta stringhe qualsiasi e FILTRA le sconosciute invece di
 * rifiutare il documento (Fase 26): quando un widget viene rimosso dal
 * codice (Monte Carlo → solo Analytics), i layout salvati che lo
 * nascondevano devono restare validi — con l'enum stretto il parse intero
 * falliva e l'utente perdeva TUTTE le sue preferenze, non solo quella
 * ormai irrilevante.
 */
export const dashboardLayoutSchema = z.object({
  hidden: z
    .array(z.string())
    .default([])
    .transform((ids) =>
      ids.filter((id): id is WidgetId =>
        (WIDGET_IDS as readonly string[]).includes(id),
      ),
    ),
  mobile: mobileLayoutSchema.default(MOBILE_DEFAULTS),
});
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : { hidden: [], mobile: MOBILE_DEFAULTS };
}
