export const ACTIVE_ACCOUNT_COOKIE = "tj-account";

/** Valore speciale del cookie: tutti i conti non archiviati insieme. */
export const ALL_ACCOUNTS = "all";

/**
 * CONTO DEMO GLOBALE "SIM1" — costanti condivise tra app e seed.
 * Il modello e le regole di scope stanno in src/lib/demo-account.ts (che
 * dipende da Prisma: il seed importa solo da qui).
 */
export const DEMO_USER_EMAIL = "sim1@demo.tradejournal.local";
export const DEMO_ACCOUNT_NAME = "SIM1";
export const DEMO_READONLY_MESSAGE =
  "Il conto demo SIM1 è in sola lettura: crea un tuo conto per inserire trade.";

/**
 * Asset class dei trade (P-02): vive qui — non nel modulo Zod — perché i
 * client component ne usano solo il valore per le Select; importarla da
 * validations/trade trascinava zod nel bundle client di 11 route. Lo schema
 * (`z.enum(ASSET_CLASSES)`) la importa da qui.
 */
export const ASSET_CLASSES = [
  "STOCK",
  "FUTURES",
  "FOREX",
  "CRYPTO",
  "OPTION",
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * Vincoli upload allegati (F16b) — stessi motivi di ASSET_CLASSES: il client
 * li usa per accept/validazione preliminare, lo schema Zod li importa da qui.
 * Il limite per file resta prudente sia per il body delle server action
 * (bodySizeLimit in next.config.ts) sia per il limite request di Vercel.
 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_ATTACHMENTS_PER_TARGET = 12;

/** MIME ammessi: screenshot e documenti di analisi, niente eseguibili. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

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
