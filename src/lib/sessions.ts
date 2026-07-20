/**
 * Sessioni di mercato (FASE analytics): fasce orarie STANDARD in UTC sul
 * momento di APERTURA del trade. Default ragionevole, configurabile in
 * futuro; unica fonte di verità per la query SQL di bucketing.
 *
 * Confini (UTC, [inizio, fine)):
 * - ASIA      00:00–08:00  (Tokyo 09:00–18:00 JST)
 * - LONDON    08:00–13:00  (apertura Londra fino all'arrivo di New York)
 * - NEWYORK   13:00–22:00  (include l'overlap Londra/NY 13–16: attribuito
 *                           a New York, la finestra a maggior volume — è la
 *                           scelta di partizione, non un doppio conteggio)
 * - OFF       22:00–24:00  (fuori sessione)
 */

export const SESSIONS = ["ASIA", "LONDON", "NEWYORK", "OFF"] as const;
export type SessionKey = (typeof SESSIONS)[number];

/** Confini in ore UTC: fine esclusiva di ciascuna fascia (in ordine). */
export const SESSION_BOUNDS_UTC = {
  asiaEnd: 8,
  londonEnd: 13,
  newYorkEnd: 22,
} as const;

export const SESSION_LABELS: Record<SessionKey, string> = {
  ASIA: "Asia",
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
    "Win rate, numero di trade, R medio e profitto suddivisi per sessione di mercato (ora di APERTURA, fasce UTC): dice in quale sessione rendi davvero.",
  formula:
    "Asia 00–08 UTC · Londra 08–13 · New York 13–22 (overlap incluso) · Fuori sessione 22–24",
};
