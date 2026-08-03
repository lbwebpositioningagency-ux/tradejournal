/**
 * Bucketing stagionale — modulo PURO (nessuna rete, nessun database).
 *
 * Due orologi, per scelta esplicita e non per comodità:
 * - i timestamp intraday arrivano da Dukascopy in UTC e restano UTC nel
 *   database;
 * - i bucket ora/sessione sono calcolati DUE VOLTE, una per orologio (UTC e
 *   Europe/Rome), e salvati entrambi.
 *
 * Il motivo per cui non basta rietichettare: tra CET e CEST lo scarto
 * Roma↔UTC cambia dentro l'anno (+1 h d'inverno, +2 h d'estate). Prendere i
 * bucket UTC e sommare un offset fisso sposterebbe metà dell'anno di un'ora
 * — l'apertura di New York finirebbe spalmata su due ore diverse a seconda
 * della stagione. La conversione passa quindi sempre dal fuso IANA, che
 * conosce le date di cambio.
 */

import { SESSIONS, SESSION_TIMEZONE, SESSION_WINDOWS } from "@/lib/sessions";
import type { SessionKey } from "@/lib/sessions";

export const CLOCKS = ["ROME", "UTC"] as const;
export type Clock = (typeof CLOCKS)[number];

export const CLOCK_TIMEZONE: Record<Clock, string> = {
  ROME: SESSION_TIMEZONE,
  UTC: "UTC",
};

export const CLOCK_LABEL: Record<Clock, string> = {
  ROME: "ora italiana",
  UTC: "UTC",
};

/** Componenti di data/ora in un fuso, già in numeri. */
export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
}

/* Un formatter per fuso, creato una volta sola: `Intl.DateTimeFormat` è
   costoso da istanziare e il job ne fa centinaia di migliaia di chiamate. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      // hourCycle h23 e non hour12:false: con hour12:false alcune
      // implementazioni rendono la mezzanotte come "24", che qui diventerebbe
      // un bucket 24 inesistente.
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Scompone un istante nel fuso richiesto, DST inclusa. */
export function zonedParts(ts: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(ts);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  for (const p of parts) {
    if (p.type === "year") year = Number(p.value);
    else if (p.type === "month") month = Number(p.value);
    else if (p.type === "day") day = Number(p.value);
    else if (p.type === "hour") hour = Number(p.value);
  }
  return { year, month, day, hour };
}

/**
 * Giorno della settimana ISO (1 = lunedì … 7 = domenica) di una data
 * civile. Calcolato su una data UTC costruita dai componenti: `getUTCDay`
 * non dipende dal fuso della macchina che esegue il job (Vercel gira in UTC,
 * il portatile no — e il risultato deve essere lo stesso).
 */
export function isoWeekday(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  const js = d.getUTCDay(); // 0 = domenica
  return js === 0 ? 7 : js;
}

/** Giorno dell'anno 1-366 (366 solo negli anni bisestili). */
export function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.round((current - start) / 86_400_000) + 1;
}

/**
 * Settimana ISO 8601 (1-53) di una data civile: la settimana che contiene il
 * giovedì. Non è la settimana "dal 1° gennaio": a cavallo d'anno una data di
 * gennaio può appartenere alla settimana 52/53 dell'anno precedente, ed è
 * corretto che il bucket stagionale la metta lì.
 */
export function isoWeek(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = isoWeekday(year, month, day);
  // Al giovedì della stessa settimana: da lì l'anno ISO è quello giusto.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const firstJan = Date.UTC(isoYear, 0, 1);
  return Math.floor((d.getTime() - firstJan) / 86_400_000 / 7) + 1;
}

/**
 * Sessione di mercato di un'ora, con la stessa partizione dell'orologio
 * italiano già usata per i trade dell'utente (`lib/sessions.ts`): Asia
 * 00-08, Londra 08-14, New York 14-22, fuori sessione 22-24. Riuso
 * deliberato: due definizioni di "sessione di Londra" nella stessa app
 * sarebbero un difetto, non una feature.
 *
 * Le sessioni sono definite SULL'OROLOGIO ITALIANO per costruzione: non
 * esiste una variante UTC, e infatti il toggle di fuso agisce solo sulle ore.
 */
export function sessionOfHour(romeHour: number): SessionKey {
  const minute = romeHour * 60;
  for (const w of SESSION_WINDOWS) {
    if (minute >= w.startMin && minute < w.endMin) return w.session;
  }
  return "OFF";
}

/** Indice numerico della sessione, come salvato nel campo `bucket`. */
export function sessionBucket(romeHour: number): number {
  return SESSIONS.indexOf(sessionOfHour(romeHour));
}

/** Etichetta dell'ora nel formato usato dagli assi ("07" → "07:00"). */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const MONTH_LABELS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

export const MONTH_LABELS_SHORT = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
] as const;

/**
 * Giorni della settimana della stagionalità: lunedì-venerdì, come tutte le
 * altre tabelle dell'app (Fase 59). Qui la scelta ha anche una ragione di
 * mercato: sabato non si scambia e la domenica esistono solo le due-tre ore
 * serali di riapertura del forex, un campione che non è confrontabile con
 * una giornata piena.
 */
export const WEEKDAY_BUCKETS = [1, 2, 3, 4, 5] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
};

/** Filtro del drill: tutto l'anno oppure dentro un singolo mese. */
export const SCOPE_ALL = "ALL";

export function monthScope(month: number): string {
  return `M${String(month).padStart(2, "0")}`;
}

/** Inverso di `monthScope`; `null` per "ALL" o per una stringa non valida. */
export function scopeMonth(scope: string): number | null {
  const m = /^M(0[1-9]|1[0-2])$/.exec(scope);
  return m ? Number(m[1]) : null;
}
