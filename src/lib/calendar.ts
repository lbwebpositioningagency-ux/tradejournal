import Decimal from "decimal.js";
import { daysInMonth, isValidCalendarDate } from "@/lib/dates";

/**
 * Aritmetica di calendario per la vista mensile e la Day View.
 *
 * Modulo puro: lavora solo su chiavi-stringa ("YYYY-MM" per i mesi,
 * "YYYY-MM-DD" per i giorni) già espresse nel fuso dell'utente — le stesse
 * prodotte dal bucketing SQL di getDailyPnl. L'aritmetica sui giorni usa
 * Date.UTC, che è privo di DST: mai interpretare queste chiavi come istanti.
 */

const DAY_MS = 86_400_000;

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-07" è un mese valido? */
export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

/** "2026-07-16" è un giorno di calendario reale? */
export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return isValidCalendarDate(year, month, day);
}

/** Aggiunge (o toglie) mesi a una chiave "YYYY-MM". */
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const total = year * 12 + (m - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12 + 1;
  return `${String(newYear).padStart(4, "0")}-${String(newMonth).padStart(2, "0")}`;
}

/** Aggiunge (o toglie) giorni a una chiave "YYYY-MM-DD". */
export function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return msToDateKey(Date.UTC(year, month - 1, day) + delta * DAY_MS);
}

function msToDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Le settimane (lunedì→domenica) che coprono il mese, come matrice di chiavi
 * giorno. La prima e l'ultima settimana possono contenere giorni dei mesi
 * adiacenti (il componente li rende attenuati).
 */
export function buildMonthWeeks(month: string): string[][] {
  const [year, m] = month.split("-").map(Number);
  const firstMs = Date.UTC(year, m - 1, 1);
  // getUTCDay: 0=domenica → riportato a 0=lunedì
  const mondayOffset = (new Date(firstMs).getUTCDay() + 6) % 7;
  const lastMs = Date.UTC(year, m - 1, daysInMonth(year, m));

  const weeks: string[][] = [];
  let cursor = firstMs - mondayOffset * DAY_MS;
  while (cursor <= lastMs) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(msToDateKey(cursor + i * DAY_MS));
    }
    weeks.push(week);
    cursor += 7 * DAY_MS;
  }
  return weeks;
}

/** Somma Decimal di P&L (stringhe decimali), scala 2. */
export function sumPnl(values: string[]): string {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(value);
  }
  return total.toFixed(2);
}

/** Ancora della sezione Calendario dentro la Dashboard. */
export const CALENDAR_ANCHOR = "calendario";

/**
 * Href del calendario mensile, che dal 16/09/2026 vive DENTRO la Dashboard
 * (la pagina a sé `/day` non esiste più).
 *
 * `keep` sono i parametri già in URL (periodo, valuta…): cambiare mese non
 * deve far perdere il periodo scelto per il resto della pagina. `month`
 * null torna al mese corrente (il vecchio «Oggi»). `anchor` aggiunge
 * `#calendario` per chi arriva da un'altra pagina; le frecce interne non lo
 * vogliono, perché restano ferme dove sono (scroll={false}).
 */
export function calendarHref(
  month: string | null,
  {
    keep = {},
    currency,
    anchor = false,
  }: {
    keep?: Record<string, string | undefined>;
    currency?: string | null;
    anchor?: boolean;
  } = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(keep)) {
    if (value) params.set(key, value);
  }
  params.delete("month");
  if (month) params.set("month", month);
  if (currency) params.set("cur", currency);
  const query = params.toString();
  return `/dashboard${query ? `?${query}` : ""}${anchor ? `#${CALENDAR_ANCHOR}` : ""}`;
}

/**
 * Lunedì della settimana (lunedì→domenica) che contiene il giorno: la chiave
 * della vista Settimana e del suo journal. È la stessa riga del calendario
 * mensile (`buildMonthWeeks`), così il totale della pagina coincide con la
 * cella «Sett.» che l'ha aperta.
 */
export function weekStartOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const mondayOffset = (new Date(ms).getUTCDay() + 6) % 7;
  return msToDateKey(ms - mondayOffset * DAY_MS);
}

/** I sette giorni (lunedì→domenica) della settimana che inizia a `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const WEEK_LABEL_DAY = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  timeZone: "UTC",
});
const WEEK_LABEL_FULL = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const WEEK_LABEL_DAY_MONTH = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * «13–19 luglio 2026», «29 giugno – 5 luglio 2026», «29 dicembre 2025 –
 * 4 gennaio 2026»: il mese e l'anno si ripetono solo quando cambiano.
 * Mezzogiorno UTC + timeZone UTC: l'etichetta non può scivolare di giorno.
 */
export function weekRangeLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const at = (key: string) => new Date(`${key}T12:00:00Z`);
  if (monday.slice(0, 7) === sunday.slice(0, 7)) {
    return `${WEEK_LABEL_DAY.format(at(monday))}–${WEEK_LABEL_FULL.format(at(sunday))}`;
  }
  if (monday.slice(0, 4) === sunday.slice(0, 4)) {
    return `${WEEK_LABEL_DAY_MONTH.format(at(monday))} – ${WEEK_LABEL_FULL.format(at(sunday))}`;
  }
  return `${WEEK_LABEL_FULL.format(at(monday))} – ${WEEK_LABEL_FULL.format(at(sunday))}`;
}
