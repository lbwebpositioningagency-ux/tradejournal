/**
 * F23 — clamp VISIVO degli outlier nei grafici a barre lineari: con un
 * +24.975 e otto barre da −600, le barre piccole diventano invisibili.
 * Il clamp tronca solo il DISEGNO (indicatore ▲/▼ sul punto troncato,
 * valore reale nel tooltip): più onesto di una scala log su P&L con segno.
 *
 * Solo display: qui i valori sono già i number del rendering dei grafici.
 */

/** Serve almeno questo numero di barre perché il clamp abbia senso. */
const MIN_POINTS = 8;
/** Il limite è 3× il 95° percentile dei valori assoluti. */
const P95_FACTOR = 3;

/**
 * Limite di troncamento per la serie, o null se non serve (nessun outlier
 * oltre 3×p95, o serie troppo corta). Simmetrico sui due segni.
 */
export function clampLimit(values: number[]): number | null {
  const abs = values
    .map(Math.abs)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (abs.length < MIN_POINTS) return null;
  // floor (non ceil): con n piccoli il percentile non deve coincidere con
  // l'outlier stesso, altrimenti non esisterebbe mai un limite.
  const p95 = abs[Math.max(0, Math.floor(abs.length * 0.95) - 1)];
  if (p95 <= 0) return null;
  const limit = p95 * P95_FACTOR;
  return abs[abs.length - 1] > limit ? limit : null;
}

export interface ClampedPoint {
  /** Valore da DISEGNARE (troncato al limite, col segno). */
  display: number;
  /** True se il punto è stato troncato: indicatore ▲/▼ e nota nel tooltip. */
  clamped: boolean;
}

/** Applica il limite a un valore (limit null = nessun clamp). */
export function clampValue(value: number, limit: number | null): ClampedPoint {
  if (limit === null || Math.abs(value) <= limit) {
    return { display: value, clamped: false };
  }
  return { display: Math.sign(value) * limit, clamped: true };
}
