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
