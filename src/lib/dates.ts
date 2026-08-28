/**
 * Helper timezone del progetto.
 *
 * Regola: i timestamp sono salvati in UTC; l'input/display avviene nel fuso
 * dell'utente (User.timezone, default Europe/Rome). Questi helper convertono
 * tra le stringhe `datetime-local` dei form (naive, nel fuso utente) e Date UTC.
 */

const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Giorni del mese (1-12), bisestili inclusi. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * True se anno/mese/giorno formano una data di calendario reale.
 * Serve perché `new Date("2026-02-31…")` NON fallisce: fa rollover silenzioso
 * al 3 marzo, spostando il trade in un altro mese.
 */
export function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** True se la parte data di una stringa datetime-local è un giorno reale. */
export function hasValidCalendarDate(local: string): boolean {
  const year = Number(local.slice(0, 4));
  const month = Number(local.slice(5, 7));
  const day = Number(local.slice(8, 10));
  return isValidCalendarDate(year, month, day);
}

/** Offset (ms) del fuso `timeZone` rispetto a UTC nell'istante `date`. */
function timezoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - date.getTime();
}

/**
 * Converte una stringa `datetime-local` (es. "2026-07-15T14:30"), interpretata
 * nel fuso `timeZone`, in una Date UTC. Doppio passaggio per gestire la DST.
 */
export function zonedInputToUtc(local: string, timeZone: string): Date {
  if (!DATETIME_LOCAL_RE.test(local)) {
    throw new Error(`Formato datetime-local non valido: "${local}"`);
  }
  if (!hasValidCalendarDate(local)) {
    throw new Error(`Data di calendario inesistente: "${local}"`);
  }
  const naiveUtc = new Date(`${local}${local.length === 16 ? ":00" : ""}Z`);
  const firstOffset = timezoneOffsetMs(naiveUtc, timeZone);
  let utc = new Date(naiveUtc.getTime() - firstOffset);
  const secondOffset = timezoneOffsetMs(utc, timeZone);
  if (secondOffset !== firstOffset) {
    utc = new Date(naiveUtc.getTime() - secondOffset);
  }
  return utc;
}

/** Converte una Date UTC nella stringa `datetime-local` nel fuso `timeZone`. */
export function utcToZonedInput(date: Date, timeZone: string): string {
  const shifted = new Date(date.getTime() + timezoneOffsetMs(date, timeZone));
  return shifted.toISOString().slice(0, 16);
}

/** Giorno di calendario corrente nel fuso utente ("YYYY-MM-DD"). */
export function todayKeyInZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formatta già come ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Formatta una Date UTC per il display nel fuso utente (data + ora). */
export function formatDateTime(
  date: Date,
  timeZone: string,
  locale = "it-IT",
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** Solo l'ora, nel fuso utente: «16:59». Per chi mostra già la data accanto. */
export function formatTime(
  date: Date,
  timeZone: string,
  locale = "it-IT",
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, timeStyle: "short" }).format(date);
}

/**
 * Durata in secondi (stringa decimale dal SQL) → "3g 2h" / "2h 14m" / "45m" /
 * "30s". Oltre le 24 ore si passa ai giorni (trade swing/multi-day).
 * SOLO display: la conversione a Number avviene qui, mai nei calcoli.
 */
export function formatDurationSec(seconds: string | null): string {
  if (seconds === null) return "—";
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "—";
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}g ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(s)}s`;
}

/**
 * Secondi trascorsi da `date` a `now` come stringa per formatDurationSec
 * (display only: il Number qui è tempo, non denaro). `now` iniettabile nei test.
 */
export function secondsSince(date: Date, now: Date = new Date()): string {
  return String((now.getTime() - date.getTime()) / 1000);
}



/**
 * Chiave giorno "YYYY-MM-DD" → data breve coerente "dd/MM" (solo display).
 * È il formato breve UNICO per le etichette di giornata (best/worst day,
 * data del max drawdown, ecc.): niente ISO grezzo sparso nell'interfaccia.
 * Se l'input non è una chiave giorno valida, lo restituisce invariato.
 */
export function formatDayKey(dayKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dayKey)) return dayKey;
  return `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;
}
