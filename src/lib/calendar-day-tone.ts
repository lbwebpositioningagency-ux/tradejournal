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
 * FILO netto di 1px del colore campionato (`-edge`). Nessuna ombra, alone o
 * sfocatura: il bagliore di caf84ec (box-shadow 6px al 75%) faceva sembrare le
 * celle accese. Testo bianco sopra
 * (≥ 12,58:1).
 * Le coppie P&L per daltonici rimappano i tre stati senza che due coincidano. 
 *
 * NON riguarda la griglia anni × mese della Dashboard, la pagina Settimana né
 * la heatmap della Disciplina: quelle restano sulla scala di `heat-scale.ts`.
 */

export type DayOutcome = "profit" | "loss" | "breakeven";

const TONE: Record<DayOutcome, string> = {
  profit: "bg-viz-day-profit border-viz-day-profit-edge",
  loss: "bg-viz-day-loss border-viz-day-loss-edge",
  breakeven: "bg-viz-day-breakeven border-viz-day-breakeven-edge",
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
