import Decimal from "decimal.js";

/**
 * Helper puri per i Reports: riempiono i bucket mancanti delle serie
 * orario/giorno (il SQL restituisce solo i bucket con trade) e trovano
 * il bucket migliore/peggiore. Solo Decimal per i confronti sul P&L.
 */

export interface BucketPoint {
  /** Etichetta di categoria ("09", "Lun"…). */
  label: string;
  netPnl: string;
  trades: number;
}

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** 24 bucket 0-23; le ore senza trade valgono 0 con zero trade. */
export function fillHourSeries(
  rows: { hour: number; netPnl: string; total: number }[],
): BucketPoint[] {
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, hour) => {
    const row = byHour.get(hour);
    return {
      label: String(hour).padStart(2, "0"),
      netPnl: row?.netPnl ?? "0",
      trades: row?.total ?? 0,
    };
  });
}

/** 7 bucket lun→dom (ISO 1-7); i giorni senza trade valgono 0. */
export function fillWeekdaySeries(
  rows: { weekday: number; netPnl: string; total: number }[],
): BucketPoint[] {
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  return Array.from({ length: 7 }, (_, i) => {
    const row = byDay.get(i + 1);
    return {
      label: WEEKDAY_SHORT[i],
      netPnl: row?.netPnl ?? "0",
      trades: row?.total ?? 0,
    };
  });
}

/**
 * Bucket migliore e peggiore per netPnl tra quelli CON trade.
 * null se nessun bucket ha trade.
 */
export function bestAndWorstBucket(points: BucketPoint[]): {
  best: BucketPoint;
  worst: BucketPoint;
} | null {
  const active = points.filter((p) => p.trades > 0);
  if (active.length === 0) return null;

  let best = active[0];
  let worst = active[0];
  for (const point of active) {
    if (new Decimal(point.netPnl).gt(best.netPnl)) best = point;
    if (new Decimal(point.netPnl).lt(worst.netPnl)) worst = point;
  }
  return { best, worst };
}
