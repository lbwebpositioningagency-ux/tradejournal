import type { WeekdayBreakdownRow } from "@/lib/queries/reports";

/**
 * Performance per giorno della settimana in dashboard: stessa forma dei
 * punti-sessione (src/lib/sessions.ts), alimentata dal breakdown ISO
 * `getWeekdayBreakdown` già usato dai Reports (giorno di APERTURA nel fuso
 * utente). Lun-ven sono sempre presenti (zeri dove mancano); sabato e
 * domenica compaiono SOLO se contengono trade nello scope attivo — il
 * weekend vuoto non merita due righe fisse, ma i trade weekend esistenti
 * (es. crypto, o il seed demo) non vengono nascosti.
 */

/** ISO: 1 = lunedì … 7 = domenica. */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  7: "Domenica",
};

export interface WeekdayPoint {
  weekday: number;
  label: string;
  total: number;
  wins: number;
  netPnl: string;
  rSum: string;
  rCount: number;
}

export function fillWeekdaySeries(rows: WeekdayBreakdownRow[]): WeekdayPoint[] {
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  const days = [1, 2, 3, 4, 5, 6, 7].filter(
    (d) => d <= 5 || (byDay.get(d)?.total ?? 0) > 0,
  );
  return days.map((weekday) => {
    const row = byDay.get(weekday);
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      total: row?.total ?? 0,
      wins: row?.wins ?? 0,
      netPnl: row?.netPnl ?? "0",
      rSum: row?.rSum ?? "0",
      rCount: row?.rCount ?? 0,
    };
  });
}

/** Testo per <MetricInfo>: tenuto accanto alla logica della serie. */
export const weekdaysInfo = {
  label: "Performance per giorno della settimana",
  description:
    "Trade, win rate, R medio e profitto per giorno della settimana, classificati sul giorno di APERTURA nel tuo fuso orario. Sabato e domenica compaiono solo se contengono trade.",
  formula:
    "Bucket ISO sul giorno di apertura (lun-ven; weekend solo se operato), stessi aggregati del report per sessione",
};
