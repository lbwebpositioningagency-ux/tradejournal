import { addDays, addMonths } from "@/lib/calendar";

/**
 * F5 — PERIODO DEL REPORT PERIODICO.
 *
 * Il report esisteva solo settimanale. Il mese è l'unità dei payout e delle
 * challenge, il trimestre quella con cui si giudica un sistema, l'anno
 * quella fiscale: un digest che sa fare solo la settimana copre la scadenza
 * più frequente e nessuna delle altre.
 *
 * Modulo PURO e senza fusi: lavora su chiavi "YYYY-MM-DD" già nel fuso
 * dell'utente, come tutto il resto del progetto. Chi lo chiama converte in
 * UTC con `zonedInputToUtc`, una volta sola, al confine con il database.
 */

export const REPORT_RANGES = ["settimana", "mese", "trimestre", "anno"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export const REPORT_RANGE_LABELS: Record<ReportRange, string> = {
  settimana: "Settimana",
  mese: "Mese",
  trimestre: "Trimestre",
  anno: "Anno",
};

/** Nome del periodo PRECEDENTE, per la riga di confronto. */
export const REPORT_PREVIOUS_LABELS: Record<ReportRange, string> = {
  settimana: "settimana precedente",
  mese: "mese precedente",
  trimestre: "trimestre precedente",
  anno: "anno precedente",
};

export function isReportRange(value: unknown): value is ReportRange {
  return (REPORT_RANGES as readonly unknown[]).includes(value);
}

/** Lunedì della settimana ISO che contiene `key`. */
export function mondayOf(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = domenica
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * Inizio del periodo che CONTIENE `key`: lunedì, primo del mese, primo del
 * trimestre, primo dell'anno. È la chiave canonica del periodo, quella che
 * finisce nell'URL e che rende un report condivisibile.
 */
export function startOfRange(key: string, range: ReportRange): string {
  const [year, month] = key.split("-").map(Number);
  switch (range) {
    case "settimana":
      return mondayOf(key);
    case "mese":
      return `${key.slice(0, 7)}-01`;
    case "trimestre": {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return `${year}-${String(first).padStart(2, "0")}-01`;
    }
    case "anno":
      return `${year}-01-01`;
  }
}

/** Primo giorno del periodo SUCCESSIVO: è l'estremo destro, escluso. */
export function endOfRange(start: string, range: ReportRange): string {
  switch (range) {
    case "settimana":
      return addDays(start, 7);
    case "mese":
      return `${addMonths(start.slice(0, 7), 1)}-01`;
    case "trimestre":
      return `${addMonths(start.slice(0, 7), 3)}-01`;
    case "anno":
      return `${Number(start.slice(0, 4)) + 1}-01-01`;
  }
}

/** Inizio del periodo precedente, per il confronto. */
export function previousStart(start: string, range: ReportRange): string {
  switch (range) {
    case "settimana":
      return addDays(start, -7);
    case "mese":
      return `${addMonths(start.slice(0, 7), -1)}-01`;
    case "trimestre":
      return `${addMonths(start.slice(0, 7), -3)}-01`;
    case "anno":
      return `${Number(start.slice(0, 4)) - 1}-01-01`;
  }
}

/** Inizio del periodo successivo (navigazione avanti). */
export function nextStart(start: string, range: ReportRange): string {
  return endOfRange(start, range);
}

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * Etichetta leggibile del periodo. Ogni intervallo ha la sua forma: una
 * settimana si dice con gli estremi, un mese col suo nome, un trimestre col
 * numero. Scriverli tutti come "dal … al …" sarebbe uniforme e illeggibile.
 */
export function reportRangeLabel(start: string, range: ReportRange): string {
  const year = start.slice(0, 4);
  const month = Number(start.slice(5, 7));
  switch (range) {
    case "settimana": {
      const end = addDays(start, 6);
      const day = (key: string) => Number(key.slice(8, 10));
      const sameMonth = start.slice(0, 7) === end.slice(0, 7);
      return sameMonth
        ? `${day(start)}–${day(end)} ${MONTHS[month - 1]} ${year}`
        : `${day(start)} ${MONTHS[month - 1]} – ${day(end)} ${MONTHS[Number(end.slice(5, 7)) - 1]} ${end.slice(0, 4)}`;
    }
    case "mese":
      return `${MONTHS[month - 1]} ${year}`;
    case "trimestre":
      return `T${Math.floor((month - 1) / 3) + 1} ${year}`;
    case "anno":
      return year;
  }
}
