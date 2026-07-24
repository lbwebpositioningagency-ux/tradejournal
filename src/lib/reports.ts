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

// ── Distribuzione R (F32) ───────────────────────────────────────────────

export interface RDistPoint {
  /** Etichetta compatta dell'asse: bordo inferiore del bin ("-1", "0,5", "BE"). */
  label: string;
  /** Range completo per il tooltip ("da -1R a -0,5R"). */
  range: string;
  count: number;
  kind: "loss" | "be" | "win";
}

/** Formatta il bordo di un bin (multipli di 0,5) in stile it-IT. */
function edge(value: number): string {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/**
 * Riempie l'istogramma R con i bin mancanti tra il minimo e il massimo
 * osservati (sempre almeno da −1R a +1R, così il grafico ha entrambi i lati).
 * Il bin BE (R = 0 esatto) è una colonna dedicata tra i negativi e i positivi.
 * Bin: indice b copre [b·0,5, (b+1)·0,5); overflow a < −4R e ≥ 4R.
 */
export function fillRDistribution(
  rows: { bin: number; count: number }[],
  beBin: number,
): RDistPoint[] {
  const be = rows.find((r) => r.bin === beBin);
  const binRows = rows.filter((r) => r.bin !== beBin);
  const byBin = new Map(binRows.map((r) => [r.bin, r.count]));

  const bins = [...byBin.keys()];
  const min = Math.min(-2, ...bins);
  const max = Math.max(1, ...bins);

  const points: RDistPoint[] = [];
  for (let b = min; b <= max; b++) {
    const label = b === -9 ? "<-4" : b === 8 ? "≥4" : edge(b * 0.5);
    const range =
      b === -9
        ? "sotto -4R"
        : b === 8
          ? "da 4R in su"
          : `da ${edge(b * 0.5)}R a ${edge((b + 1) * 0.5)}R`;
    points.push({
      label,
      range,
      count: byBin.get(b) ?? 0,
      kind: b < 0 ? "loss" : "win",
    });
    // La colonna BE si inserisce tra l'ultimo bin negativo e il primo ≥ 0.
    if (b === -1) {
      points.push({
        label: "BE",
        range: "breakeven (R = 0)",
        count: be?.count ?? 0,
        kind: "be",
      });
    }
  }
  return points;
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
