import type { WeekdayBreakdownRow } from "@/lib/queries/reports";
import type { RSplitAggregates } from "@/lib/metrics/types";

/**
 * Performance per giorno della settimana in dashboard: stessa forma dei
 * punti-sessione (src/lib/sessions.ts), alimentata dal breakdown ISO
 * `getWeekdayBreakdown` già usato dai Reports (giorno di APERTURA nel fuso
 * utente).
 *
 * SEMPRE E SOLO LUN-VEN, cinque righe fisse con gli zeri dove mancano.
 * Prima sabato e domenica comparivano se contenevano trade: decisione
 * provvisoria, ora chiusa in senso opposto. Il weekend è escluso ANCHE
 * quando lo scope attivo ha trade weekend (oggi succede sul conto demo
 * SIM1, 7 trade di sabato nel seed): quei trade continuano a contare in
 * tutte le altre metriche del conto — P&L, win rate, equity, calendario —
 * semplicemente non hanno una riga qui. La tabella misura la settimana
 * operativa, e cinque righe stabili si confrontano fra conti e periodi
 * mentre una tabella che cambia numero di righe no.
 */

/**
 * ISO: 1 = lunedì … 5 = venerdì. Sabato (6) e domenica (7) non hanno
 * un'etichetta perché non sono rappresentabili in questo widget: chi
 * aggiunge una chiave qui sta cambiando la decisione di cui sopra.
 */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
};

/** Giorni mostrati, in ordine ISO: la settimana operativa e basta. */
const WEEKDAYS = [1, 2, 3, 4, 5];

export interface WeekdayPoint extends RSplitAggregates {
  weekday: number;
  label: string;
  total: number;
  wins: number;
  /** Serve al Profit Factor della riga (Fase 60). */
  winSum: string;
  /** ≤ 0, col segno. */
  lossSum: string;
  netPnl: string;
  rSum: string;
  rCount: number;
}

export function fillWeekdaySeries(rows: WeekdayBreakdownRow[]): WeekdayPoint[] {
  // Le righe di sabato/domenica in ingresso vengono semplicemente ignorate:
  // la query resta quella dei Reports (bucket ISO 1-7), è la vista che si
  // ferma al venerdì.
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  return WEEKDAYS.map((weekday) => {
    const row = byDay.get(weekday);
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      total: row?.total ?? 0,
      wins: row?.wins ?? 0,
      winSum: row?.winSum ?? "0",
      lossSum: row?.lossSum ?? "0",
      netPnl: row?.netPnl ?? "0",
      rSum: row?.rSum ?? "0",
      rCount: row?.rCount ?? 0,
      rWinSum: row?.rWinSum ?? "0",
      rWinCount: row?.rWinCount ?? 0,
      rLossSum: row?.rLossSum ?? "0",
      rLossCount: row?.rLossCount ?? 0,
    };
  });
}

/** Testo per <MetricInfo>: tenuto accanto alla logica della serie. */
export const weekdaysInfo = {
  label: "Performance per giorno della settimana",
  description:
    "Trade, win rate, Avg Win/Loss, profit factor, expectancy in R e profitto per giorno della settimana, classificati sul giorno di APERTURA nel tuo fuso orario. Solo lunedì-venerdì: eventuali trade del weekend restano nelle altre metriche del conto ma non compaiono in questa tabella.",
  formula:
    "Bucket ISO sul giorno di apertura, lun-ven (weekend escluso), stessi aggregati del report per sessione",
};
