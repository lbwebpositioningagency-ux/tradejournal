/**
 * Data e ora di una nota nel fuso dell'utente: «mercoledì 16 settembre 2026,
 * 11:40». È il riferimento della nota, quindi si scrive per intero.
 */
export function formatNoteDateTime(date: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day}, ${time}`;
}

/** Forma breve per le righe dell'elenco: «16 set 2026 · 11:40». */
export function formatNoteDateTimeShort(date: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
}
