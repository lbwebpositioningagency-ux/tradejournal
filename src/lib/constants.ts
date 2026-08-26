export const ACTIVE_ACCOUNT_COOKIE = "tj-account";

/** Valore speciale del cookie: tutti i conti non archiviati insieme. */
export const ALL_ACCOUNTS = "all";

/**
 * Flag dei cookie scritti dal SERVER (SECURITY_AUDIT P2-12).
 *
 * Valgono per `tj-account`, `tj-accent` e `tj-pnl`: sono letti solo via
 * `cookies()` di next/headers, mai da JavaScript, quindi `httpOnly` non
 * toglie niente a nessuno. NON usarli per `tj-period`, che il client scrive
 * da sé con `document.cookie` e che quindi httpOnly romperebbe.
 *
 * `secure` solo in produzione: in sviluppo si va su http://localhost.
 * `sameSite: "lax"` lascia funzionare l'arrivo da link esterni ma non manda
 * il cookie sulle richieste cross-site che contano.
 */
export const SERVER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;

/** Un anno: sono preferenze, non sessioni. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

/**
 * J-1 — CATEGORIE DEI TAG, condivise fra UI, validazione e report.
 *
 * Vivono qui e non in `validations/`: `TagPicker` è un client component e
 * importare da un modulo con zod dentro rimetterebbe lo schema nel bundle
 * (P-02). L'ordine è quello di comparsa nel menu: prima le tre categorie
 * che alimentano le analisi (setup, errore, emozione), poi il ripiego.
 *
 * Devono restare allineate all'enum `TagCategory` di Prisma: sono le stesse
 * quattro chiavi, e i Reports le usano per l'etichetta accanto al nome.
 */
export const TAG_CATEGORIES = ["SETUP", "MISTAKE", "EMOTION", "CUSTOM"] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** Categoria di ripiego: quella con cui nasce un tag non classificato. */
export const DEFAULT_TAG_CATEGORY: TagCategory = "CUSTOM";

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  SETUP: "setup",
  MISTAKE: "errore",
  EMOTION: "emozione",
  CUSTOM: "custom",
};

/** Riga di aiuto sotto al menu: cosa cambia scegliendo una categoria. */
export const TAG_CATEGORY_HINTS: Record<TagCategory, string> = {
  SETUP: "il tipo di operazione (breakout, pullback…)",
  MISTAKE: "un errore commesso — alimenta il costo degli errori nel report settimanale",
  EMOTION: "lo stato emotivo (disciplina, tilt…)",
  CUSTOM: "nessuna delle precedenti",
};

/**
 * P-02 — VALUTE DEI CONTI, qui e non in `validations/account.ts`.
 *
 * La lista la usano tre form client (registrazione, profilo, conti) e uno
 * schema Zod. Finché viveva accanto allo schema, importarla trascinava zod
 * nel bundle di quelle pagine: su `/register` erano 63 kB gz su 137, cioè il
 * 46% del payload della prima pagina che un utente nuovo vede — per un elenco
 * di cinque stringhe. Stessa medicina già usata per `ASSET_CLASSES` e per il
 * layout della dashboard: le COSTANTI stanno qui, gli SCHEMI restano server.
 */
export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];
