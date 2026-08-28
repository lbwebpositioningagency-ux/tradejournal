import { SCORECARD_ASSETS, type ScorecardAsset } from "@/lib/macro-desk-scorecard";

/**
 * PARSER DIFENSIVO del Weekly Bias Record (payload v2 del Macro Desk).
 *
 * Il desk è un sistema esterno che evolve: la regola del progetto per i suoi
 * payload è "mai un crash, elementi malformati scartati, i validi conservati"
 * (stessa scelta già fatta in macro-desk-payload.ts per il dettaglio report).
 * Qui vale doppio, perché da questi dati esce una statistica pubblicata: un
 * campo storto non deve produrre un numero storto, deve produrre un buco
 * dichiarato.
 *
 * Vocabolario (§3 del brief):
 * - il bias è dichiarato la domenica e resta IMMUTABILE fino al venerdì;
 * - i report giornalieri aggiornano solo il monitoraggio (path, mfe, mae);
 * - un RAMO condizionale è un evento a calendario noto all'emissione: quando
 *   si attiva il bias PROSEGUE sul ramo, non è un errore;
 * - un'INVALIDAZIONE è uno shock non prevedibile, dichiarato in anticipo:
 *   chiude il bias.
 */

export const BIAS_STATUSES = [
  "live",
  "branched",
  "invalidated",
  "resolved",
] as const;
export type BiasStatus = (typeof BIAS_STATUSES)[number];

export const EM_SOURCES = ["iv", "model", "unavailable"] as const;
export type EmSource = (typeof EM_SOURCES)[number];

export interface BiasBranch {
  id: string;
  event: string;
  condition: string;
  effect: string;
  status: "pending" | "triggered" | "expired";
}

export interface BiasInvalidation {
  id: string;
  condition: string;
  type: "price" | "shock";
  status: "armed" | "fired";
}

export interface BiasPathPoint {
  date: string;
  px: number;
  moveEm: number;
}

/** Un asset dentro il Weekly Bias Record. */
export interface AssetBiasRecord {
  asset: ScorecardAsset;
  bias: string;
  confidence: number | null;
  /** Prezzo di riferimento all'emissione. */
  p0: number | null;
  /** Expected Move della settimana; null se il desk non l'ha potuto stimare. */
  em: number | null;
  emSource: EmSource | null;
  ivUsed: number | null;
  branches: BiasBranch[];
  invalidations: BiasInvalidation[];
  status: BiasStatus;
  /** Massima escursione favorevole/avversa in EM, orientate al bias. */
  mfeEm: number | null;
  maeEm: number | null;
  path: BiasPathPoint[];
}

export interface WeeklyBiasRecord {
  /** Domenica di emissione, "YYYY-MM-DD". */
  weekStart: string;
  /** Venerdì di chiusura, "YYYY-MM-DD". */
  windowEnd: string | null;
  assets: AssetBiasRecord[];
}

// ── Utility di lettura tolleranti ───────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Numero finito, oppure null. Le stringhe numeriche sono accettate. */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** "YYYY-MM-DD" plausibile; qualunque altra cosa è come se non ci fosse. */
function dateKey(value: unknown): string | null {
  const s = str(value);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const s = str(value)?.toLowerCase();
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// ── Parsing ─────────────────────────────────────────────────────────────

function parseBranches(value: unknown): BiasBranch[] {
  const out: BiasBranch[] = [];
  for (const raw of list(value)) {
    if (!isRecord(raw)) continue;
    const id = str(raw.id);
    if (!id) continue; // senza id non è referenziabile: si scarta
    out.push({
      id,
      event: str(raw.event) ?? "",
      condition: str(raw.condition) ?? "",
      effect: str(raw.effect) ?? "",
      status:
        oneOf(raw.status, ["pending", "triggered", "expired"] as const) ??
        "pending",
    });
  }
  return out;
}

function parseInvalidations(value: unknown): BiasInvalidation[] {
  const out: BiasInvalidation[] = [];
  for (const raw of list(value)) {
    if (!isRecord(raw)) continue;
    const id = str(raw.id);
    if (!id) continue;
    out.push({
      id,
      condition: str(raw.condition) ?? "",
      type: oneOf(raw.type, ["price", "shock"] as const) ?? "price",
      status: oneOf(raw.status, ["armed", "fired"] as const) ?? "armed",
    });
  }
  return out;
}

/** Punti del percorso: ordinati per data, senza duplicati, solo se completi. */
function parsePath(value: unknown): BiasPathPoint[] {
  const byDate = new Map<string, BiasPathPoint>();
  for (const raw of list(value)) {
    if (!isRecord(raw)) continue;
    const date = dateKey(raw.date);
    const px = num(raw.px);
    const moveEm = num(raw.move_EM ?? raw.moveEm);
    // Un punto senza data o senza movimento non dice nulla di utile.
    if (!date || moveEm === null) continue;
    byDate.set(date, { date, px: px ?? Number.NaN, moveEm });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function parseAsset(
  asset: ScorecardAsset,
  value: unknown,
): AssetBiasRecord | null {
  if (!isRecord(value)) return null;
  const bias = str(value.bias)?.toUpperCase();
  if (!bias) return null; // senza bias non c'è niente da valutare

  const em = num(value.em);
  return {
    asset,
    bias,
    confidence: num(value.confidence),
    p0: num(value.P0 ?? value.p0),
    // Un EM non positivo non è utilizzabile come unità di misura: meglio
    // dichiararlo assente che dividere per un numero che non ha senso.
    em: em !== null && em > 0 ? em : null,
    emSource: oneOf(value.emSource, EM_SOURCES),
    ivUsed: num(value.ivUsed),
    branches: parseBranches(value.branches),
    invalidations: parseInvalidations(value.invalidations),
    status: oneOf(value.status, BIAS_STATUSES) ?? "live",
    mfeEm: num(value.mfe_EM ?? value.mfeEm),
    maeEm: num(value.mae_EM ?? value.maeEm),
    path: parsePath(value.path),
  };
}

/**
 * Legge un Weekly Bias Record dal JSON grezzo. Torna null se manca la
 * settimana di riferimento o se nessun asset è leggibile: una riga senza
 * `weekStart` non è collocabile nel tempo e non può entrare in scorecard.
 */
export function parseWeeklyBiasRecord(value: unknown): WeeklyBiasRecord | null {
  if (!isRecord(value)) return null;
  const weekStart = dateKey(value.weekStart);
  if (!weekStart) return null;

  const assetsRaw = isRecord(value.assets) ? value.assets : {};
  const assets: AssetBiasRecord[] = [];
  for (const asset of SCORECARD_ASSETS) {
    const parsed = parseAsset(asset, assetsRaw[asset]);
    if (parsed) assets.push(parsed);
  }
  if (assets.length === 0) return null;

  return { weekStart, windowEnd: dateKey(value.windowEnd), assets };
}

/** Stato giornaliero di un asset (blocco `monitor` dei report DAILY). */
export interface AssetMonitor {
  asset: ScorecardAsset;
  state: "conferma" | "indebolisce" | "stress" | null;
  moveEm: number | null;
  note: string | null;
  /**
   * LA LETTURA DI OGGI, distinta dall'impegno della domenica (campo nuovo,
   * dai report del 28/08/2026 in poi). L'impegno sta in `biasRecord` e non si
   * tocca per tutta la settimana; questo dice quanto il desk si fida di quel
   * bias adesso. Nessuno dei due corregge l'altro.
   */
  confidenceOggi: number | null;
  /** Perché la lettura di oggi è quella che è: dichiarato, non dedotto. */
  confMotivo: string | null;
}

export function parseMonitor(value: unknown): AssetMonitor[] {
  if (!isRecord(value)) return [];
  const out: AssetMonitor[] = [];
  for (const asset of SCORECARD_ASSETS) {
    const raw = value[asset];
    if (!isRecord(raw)) continue;
    out.push({
      asset,
      state: oneOf(raw.state, ["conferma", "indebolisce", "stress"] as const),
      moveEm: num(raw.move_EM ?? raw.moveEm),
      note: str(raw.note),
      confidenceOggi: num(raw.confidenceOggi),
      confMotivo: str(raw.confMotivo),
    });
  }
  return out;
}
