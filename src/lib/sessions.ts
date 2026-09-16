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

import type { BreakdownAggregates } from "@/lib/queries/reports";
import { emptyBreakdownAggregates } from "@/lib/reports";

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
export interface SessionRow extends BreakdownAggregates {
  session: string;
}

/** Riga della tabella «Per sessione» di Reports: aggregati completi + etichetta. */
export interface SessionPoint extends BreakdownAggregates {
  session: SessionKey;
  label: string;
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
      ...(row ?? emptyBreakdownAggregates()),
      session,
      label: SESSION_LABELS[session],
    };
  });
}

/** Testo per <MetricInfo>: tenuto accanto alla definizione delle fasce. */
export const sessionsInfo = {
  label: "Performance per sessione",
  description:
    "Trade, win rate, Avg Win/Loss, profit factor, expectancy in R, attesa per trade e Net P&L per sessione di mercato, classificati sull'ora di APERTURA in ora italiana (Europe/Rome, ora legale gestita automaticamente). Le fasce sono contigue: ogni trade appartiene a una sessione sola, e le 22–24 sono una categoria a sé.",
  formula:
    "Ora italiana: Asia (Tokyo) 00–08 · Europa (Londra) 08–14 · America (New York) 14–22 · Fuori sessione 22–24",
};
