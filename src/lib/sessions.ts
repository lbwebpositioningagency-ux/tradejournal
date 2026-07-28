/**
 * Sessioni di mercato: classificazione sull'ora di APERTURA del trade nel
 * FUSO DELL'EXCHANGE (F7) — non più fasce UTC fisse: con l'ora legale i
 * confini UTC scivolano e i trade finivano nella sessione sbagliata per
 * metà anno (il seed classificava "Asia" aperture delle 09:00 di Roma).
 *
 * Definizione (ora LOCALE dell'exchange, [inizio, fine), DST gestita dal
 * doppio AT TIME ZONE in SQL):
 * - NEWYORK  09:30–16:00  America/New_York  (cash session)
 * - LONDON   08:00–16:30  Europe/London
 * - ASIA     09:00–15:00  Asia/Tokyo
 * - OFF      tutto il resto
 *
 * Le finestre si SOVRAPPONGONO (Londra pomeriggio = mattina NY): la
 * partizione è per priorità New York → Londra → Asia, cioè l'overlap va
 * alla sessione a maggior volume. È una scelta di attribuzione dichiarata,
 * non un doppio conteggio.
 */

export const SESSIONS = ["ASIA", "LONDON", "NEWYORK", "OFF"] as const;
export type SessionKey = (typeof SESSIONS)[number];

/**
 * Finestre in minuti LOCALI dell'exchange ([inizio, fine)), nell'ordine di
 * priorità di attribuzione. Unica fonte di verità per la query SQL.
 */
export const SESSION_WINDOWS: {
  session: Exclude<SessionKey, "OFF">;
  timezone: string;
  startMin: number;
  endMin: number;
}[] = [
  { session: "NEWYORK", timezone: "America/New_York", startMin: 9 * 60 + 30, endMin: 16 * 60 },
  { session: "LONDON", timezone: "Europe/London", startMin: 8 * 60, endMin: 16 * 60 + 30 },
  { session: "ASIA", timezone: "Asia/Tokyo", startMin: 9 * 60, endMin: 15 * 60 },
];

export const SESSION_LABELS: Record<SessionKey, string> = {
  ASIA: "Asia (Tokyo)",
  LONDON: "Londra",
  NEWYORK: "New York",
  OFF: "Fuori sessione",
};

/** Riga SQL del breakdown per sessione (stesse colonne degli altri breakdown). */
export interface SessionRow {
  session: string;
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPnl: string;
  winSum: string;
  lossSum: string;
  rSum: string;
  rCount: number;
}

export interface SessionPoint {
  session: SessionKey;
  label: string;
  total: number;
  wins: number;
  netPnl: string;
  rSum: string;
  rCount: number;
}

/**
 * Riempie le 4 sessioni nell'ordine canonico (il SQL restituisce solo quelle
 * con trade); righe con chiave sconosciuta vengono ignorate (difensivo).
 */
export function fillSessionSeries(rows: SessionRow[]): SessionPoint[] {
  const bySession = new Map(rows.map((r) => [r.session, r]));
  return SESSIONS.map((session) => {
    const row = bySession.get(session);
    return {
      session,
      label: SESSION_LABELS[session],
      total: row?.total ?? 0,
      wins: row?.wins ?? 0,
      netPnl: row?.netPnl ?? "0",
      rSum: row?.rSum ?? "0",
      rCount: row?.rCount ?? 0,
    };
  });
}

/** Testo per <MetricInfo>: tenuto accanto alla definizione delle fasce. */
export const sessionsInfo = {
  label: "Performance per sessione",
  description:
    "Trade, win rate, R medio e profitto per sessione di mercato, classificati sull'ora di APERTURA nel fuso dell'exchange (ora legale inclusa). Gli overlap vanno alla sessione a maggior volume: New York prima di Londra, Londra prima di Tokyo.",
  formula:
    "New York 09:30–16:00 (America/New_York) · Londra 08:00–16:30 (Europe/London) · Asia 09:00–15:00 (Asia/Tokyo) · priorità NY → Londra → Asia · resto: fuori sessione",
};
