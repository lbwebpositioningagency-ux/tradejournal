/**
 * Colore delle celle del CALENDARIO MENSILE della Dashboard: pieno e uguale
 * per tutte le giornate dello stesso esito, come nel riferimento TradeZella
 * (17/09/2026, tavola «Calendario - colore pieno, confronto col riferimento»).
 *
 * Nessuna scala di intensità: un +113 e un +1.496 hanno la stessa cella. Il
 * valore lo dice la cifra, la cella dice solo l'esito della giornata:
 *   utile → verde · perdita → rosso · chiusa a zero → blu · nessun trade → vuota.
 *
 * I colori sono quelli CAMPIONATI dallo screenshot di riferimento, identici in
 * entrambi i temi (`--viz-day-*` in globals.css): riempimento piatto più un
 * BORDO NEON nel colore dell'esito — 1px pieno del colore campionato (`-edge`)
 * a ogni densità e, in scuro, un alone (6px) dello stesso colore al 75%. Il mezzo
 * pixel di 8699449 su uno schermo 1x era quasi invisibile. Testo bianco sopra
 * (≥ 12,58:1).
 * Le coppie P&L per daltonici rimappano i tre stati senza che due coincidano. 
 *
 * NON riguarda la griglia anni × mese della Dashboard, la pagina Settimana né
 * la heatmap della Disciplina: quelle restano sulla scala di `heat-scale.ts`.
 */

export type DayOutcome = "profit" | "loss" | "breakeven";

/* Alone del neon: stesso colore del bordo al 75%, sfocato 6px, SOLO in scuro.
   Sulla card bianca l'alone scurisce il fondo accanto al filo e lo porta sotto
   3:1 (misurato 2,6:1): in chiaro resta il filo pieno. Scritto per esteso
   perché Tailwind trova le classi solo come stringhe intere. */
function glow(outcome: DayOutcome): string {
  return {
    profit: "dark:shadow-[0_0_6px_color-mix(in_srgb,var(--viz-day-profit-edge)_75%,transparent)]",
    loss: "dark:shadow-[0_0_6px_color-mix(in_srgb,var(--viz-day-loss-edge)_75%,transparent)]",
    breakeven: "dark:shadow-[0_0_6px_color-mix(in_srgb,var(--viz-day-breakeven-edge)_75%,transparent)]",
  }[outcome];
}

const TONE: Record<DayOutcome, string> = {
  profit: `bg-viz-day-profit border-viz-day-profit-edge ${glow("profit")}`,
  loss: `bg-viz-day-loss border-viz-day-loss-edge ${glow("loss")}`,
  breakeven: `bg-viz-day-breakeven border-viz-day-breakeven-edge ${glow("breakeven")}`,
};

/** Esito della giornata dal segno del P&L netto (stringa decimale). */
export function dayOutcome(netPnl: string): DayOutcome {
  const trimmed = netPnl.trim();
  if (/^-?0*(\.0*)?$/.test(trimmed)) return "breakeven";
  return trimmed.startsWith("-") ? "loss" : "profit";
}

/** Sfondo e bordo della cella: una terna per esito, mai graduata. */
export function calendarDayTone(outcome: DayOutcome): string {
  return TONE[outcome];
}

/** Testo sopra la cella colorata (cifra, numero del giorno, conteggio). */
export const DAY_TEXT = "text-viz-day-foreground";
