/**
 * Sessioni di mercato: classificazione sull'ora di APERTURA del trade in
 * ORA ITALIANA (Fase 35, ridefinisce la F7). Non più i fusi dei singoli
 * exchange con finestre sovrapposte e priorità: il trader ragiona sul
 * proprio orologio, e le fasce sono una PARTIZIONE contigua della giornata
 * italiana — ogni minuto appartiene a esattamente una sessione, nessuna
 * regola di precedenza da spiegare.
 *
 * Definizione (ora di Europe/Rome, [inizio, fine)):
 * - ASIA     00:00–08:00  (Tokyo)
 * - LONDON   08:00–14:00  (Europa)
 * - NEWYORK  14:00–22:00  (America)
 * - OFF      22:00–24:00  (fuori sessione — categoria a sé)
 *
 * L'ora legale è gestita dal fuso IANA col doppio AT TIME ZONE in SQL
 * (timestamp naive UTC → Europe/Rome), MAI da un offset fisso: tra CET e
 * CEST i confini in UTC scivolano di un'ora e la classificazione resta
 * corretta in entrambe le stagioni.
 */

export const SESSIONS = ["ASIA", "LONDON", "NEWYORK", "OFF"] as const;
export type SessionKey = (typeof SESSIONS)[number];

/** Fuso unico della classificazione: l'orologio del trader, non gli exchange. */
export const SESSION_TIMEZONE = "Europe/Rome";

/**
 * Fasce in minuti dell'ora italiana ([inizio, fine)), contigue e senza
 * sovrapposizioni; OFF è il residuo 22:00–24:00. Unica fonte di verità per
 * la query SQL.
 */
export const SESSION_WINDOWS: {
  session: Exclude<SessionKey, "OFF">;
  startMin: number;
  endMin: number;
}[] = [
  { session: "ASIA", startMin: 0, endMin: 8 * 60 },
  { session: "LONDON", startMin: 8 * 60, endMin: 14 * 60 },
  { session: "NEWYORK", startMin: 14 * 60, endMin: 22 * 60 },
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
    "Trade, win rate, R medio e profitto per sessione di mercato, classificati sull'ora di APERTURA in ora italiana (Europe/Rome, ora legale gestita automaticamente). Le fasce sono contigue: ogni trade appartiene a una sessione sola, e le 22–24 sono una categoria a sé.",
  formula:
    "Ora italiana: Asia (Tokyo) 00–08 · Europa (Londra) 08–14 · America (New York) 14–22 · Fuori sessione 22–24",
};
