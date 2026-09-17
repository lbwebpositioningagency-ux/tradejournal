import { pluralize } from "@/lib/utils";

/**
 * Scheda del riepilogo settimanale nella colonna «Sett.» del calendario
 * mensile, sul modello TradeZella (tavola «Calendario - schede settimanali,
 * confronto col riferimento», 17/09/2026): etichetta della settimana, P&L
 * della settimana, pillola coi GIORNI OPERATIVI. Il numero di trade non c'è
 * più: si vede aprendo la settimana.
 *
 * I giorni operativi sono le giornate della settimana presenti nella serie
 * giornaliera del mese — la stessa, già filtrata per valuta, da cui la testata
 * conta «N giorni verdi su M». Qui non si ricalcola niente.
 */

/** «Settimana 1», «Settimana 2»… nell'ordine delle righe del mese. */
export function weekLabel(index: number): string {
  return `Settimana ${index + 1}`;
}

/** Forma corta per la colonna stretta sotto sm: «S1». */
export function weekLabelShort(index: number): string {
  return `S${index + 1}`;
}

/** «0 giorni», «1 giorno», «4 giorni». */
export function tradingDaysLabel(days: number): string {
  return `${days} ${pluralize(days, "giorno", "giorni")}`;
}

/** Forma corta sotto sm: «1g». */
export function tradingDaysLabelShort(days: number): string {
  return `${days}g`;
}

/** Colore dell'importo: tinte campionate dal riferimento, neutro a zero. */
export function weekAmountClass(net: string): string {
  const trimmed = net.trim();
  if (/^-?0*(\.0*)?$/.test(trimmed)) return "text-foreground";
  return trimmed.startsWith("-") ? "text-viz-week-loss" : "text-viz-week-profit";
}
