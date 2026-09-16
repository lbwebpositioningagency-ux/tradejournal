import type { BreakdownAggregates, WeekdayBreakdownRow } from "@/lib/queries/reports";
import { emptyBreakdownAggregates } from "@/lib/reports";

/**
 * Performance per giorno della settimana, tabella di Reports: stessa forma
 * dei punti-sessione (src/lib/sessions.ts), alimentata dal breakdown ISO
 * `getWeekdayBreakdown` che serve anche il grafico per giorno (giorno di
 * APERTURA nel fuso utente).
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
 * un'etichetta perché non sono rappresentabili in questa tabella: chi
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

/** Riga della tabella «Per giorno della settimana» di Reports. */
export interface WeekdayPoint extends BreakdownAggregates {
  weekday: number;
  label: string;
}

export function fillWeekdaySeries(rows: WeekdayBreakdownRow[]): WeekdayPoint[] {
  // Le righe di sabato/domenica in ingresso vengono semplicemente ignorate:
  // la query resta quella del grafico per giorno (bucket ISO 1-7), è la
  // tabella che si ferma al venerdì.
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  return WEEKDAYS.map((weekday) => {
    const row = byDay.get(weekday);
    return {
      ...(row ?? emptyBreakdownAggregates()),
      weekday,
      label: WEEKDAY_LABELS[weekday],
    };
  });
}

/** Testo per <MetricInfo>: tenuto accanto alla logica della serie. */
export const weekdaysInfo = {
  label: "Performance per giorno della settimana",
  description:
    "Trade, win rate, Avg Win/Loss, profit factor, expectancy in R, attesa per trade e Net P&L per giorno della settimana, classificati sul giorno di APERTURA nel tuo fuso orario. Solo lunedì-venerdì: eventuali trade del weekend restano nelle altre metriche del conto ma non compaiono in questa tabella.",
  formula:
    "Bucket ISO sul giorno di apertura, lun-ven (weekend escluso), stessi aggregati del report per sessione",
};
