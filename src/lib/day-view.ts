import { mondayOf } from "@/lib/report-period";

/**
 * DAY VIEW — l'elenco cronologico dei giorni (o delle settimane) del journal.
 *
 * Nessun numero nuovo: il Net P&L arriva dalle serie che l'app calcola già
 * (`getDailyPnl`, `getPeriodPnl` settimanale), i giorni con journal dalle note
 * DAILY. Qui si fa solo l'UNIONE delle due chiavi e l'ordine dal più recente:
 * un giorno con journal e senza trade compare, con il P&L assente e non zero.
 */

export interface PnlBucket {
  /** Giorno ("YYYY-MM-DD") o lunedì della settimana, nel fuso utente. */
  key: string;
  netPnl: string;
  trades: number;
}

export interface DayViewRow {
  key: string;
  /** null = nessun trade (nella valuta mostrata) in quel giorno o settimana. */
  netPnl: string | null;
  trades: number;
  /** Giorni con journal: 1/0 per un giorno, il conteggio per una settimana. */
  journalDays: number;
}

export type DayViewMode = "day" | "week";

export function isDayViewMode(value: unknown): value is DayViewMode {
  return value === "day" || value === "week";
}

/**
 * Unisce P&L e giorni con journal, dal più recente.
 * In modalità settimana i giorni con journal si contano nel loro lunedì ISO,
 * lo stesso inizio di `date_trunc('week')` in `getPeriodPnl`.
 */
export function buildDayViewRows(
  mode: DayViewMode,
  pnl: readonly PnlBucket[],
  journalDayKeys: readonly string[],
): DayViewRow[] {
  const rows = new Map<string, DayViewRow>();
  for (const bucket of pnl) {
    rows.set(bucket.key, {
      key: bucket.key,
      netPnl: bucket.netPnl,
      trades: bucket.trades,
      journalDays: 0,
    });
  }
  for (const day of new Set(journalDayKeys)) {
    const key = mode === "week" ? mondayOf(day) : day;
    const row = rows.get(key) ?? { key, netPnl: null, trades: 0, journalDays: 0 };
    row.journalDays += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/**
 * Pagina Settimana del journal: NON esiste ancora (verificato su origin/main
 * il 16/09/2026 — `/reports/settimana` è il Report periodico, un'altra cosa).
 * Quando sarà pubblicata basta restituire qui il suo indirizzo: le righe della
 * modalità Week mostrano il pulsante «Vedi settimana» solo se questo non è null.
 */
export function weekPageHref(monday: string): string | null {
  void monday;
  return null;
}

/** «Martedì 15 settembre 2026» da una chiave giorno, senza scivolare di fuso. */
export function dayViewDayLabel(key: string): string {
  const label = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
