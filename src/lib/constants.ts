export const ACTIVE_ACCOUNT_COOKIE = "tj-account";

/** Valore speciale del cookie: tutti i conti non archiviati insieme. */
export const ALL_ACCOUNTS = "all";

/** Cookie del colore di accento (FASE 10): data-accent su <html>. */
export const ACCENT_COOKIE = "tj-accent";

/**
 * Set curato di accenti. Ogni coppia primary/foreground è definita in
 * globals.css con contrasto WCAG AA verificato in light e dark.
 */
export const ACCENTS = ["blue", "violet", "emerald", "amber", "rose"] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = "blue";

export const ACCENT_LABELS: Record<Accent, string> = {
  blue: "Blu",
  violet: "Viola",
  emerald: "Smeraldo",
  amber: "Ambra",
  rose: "Rosa",
};

/** Cookie della coppia colori profit/loss: data-pnl su <html>. */
export const PNL_COOKIE = "tj-pnl";

/**
 * Coppie profit/loss curate, definite in globals.css: ogni coppia è validata
 * WCAG AA in light e dark; blue-orange e teal-violet sono distinguibili
 * anche con daltonismo rosso-verde (asse blu-giallo OKLab).
 */
export const PNL_PALETTES = ["classic", "blue-red", "green-violet"] as const;
export type PnlPalette = (typeof PNL_PALETTES)[number];
export const DEFAULT_PNL_PALETTE: PnlPalette = "classic";

export const PNL_PALETTE_LABELS: Record<PnlPalette, string> = {
  classic: "Verde / Rosso",
  "blue-red": "Blu / Rosso",
  "green-violet": "Verde / Viola",
};

export const PNL_PALETTE_HINTS: Record<PnlPalette, string> = {
  classic: "convenzione classica",
  "blue-red": "adatta al daltonismo rosso-verde",
  "green-violet": "adatta al daltonismo rosso-verde",
};
