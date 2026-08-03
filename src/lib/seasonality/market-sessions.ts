/**
 * SESSIONI DI MERCATO per la Stagionalità — modulo PURO.
 *
 * ── Perché non riuso `lib/sessions.ts` ────────────────────────────────────
 *
 * Quel modulo classifica i TRADE DELL'UTENTE su fasce fisse dell'orologio
 * italiano (Asia 00-08, Londra 08-14, New York 14-22): è una decisione presa
 * apposta nella Fase 35, e risponde alla domanda «a che ora ho operato, sul
 * mio orologio». Qui la domanda è un'altra: «quale sessione di mercato ha
 * prodotto il movimento». Sono due domande diverse e meritano due risposte
 * diverse — la seconda va ancorata agli orari dei CENTRI FINANZIARI.
 *
 * Il motivo è concreto e non teorico: **Londra e New York non cambiano ora
 * negli stessi giorni**. L'Unione Europea passa all'ora legale l'ultima
 * domenica di marzo e torna indietro l'ultima di ottobre; gli Stati Uniti la
 * seconda domenica di marzo e la prima di novembre. Restano quindi due
 * finestre l'anno — circa tre settimane a marzo e una a fine ottobre — in cui
 * lo scarto Londra↔New York vale un'ora in più o in meno del solito. Con
 * confini fissi sull'orologio italiano, in quelle settimane l'apertura di New
 * York cadrebbe nel bucket sbagliato, e la riga più importante della tabella
 * sarebbe diluita su due sessioni.
 *
 * Il Giappone non ha ora legale: JST è UTC+9 tutto l'anno.
 *
 * ── La partizione ─────────────────────────────────────────────────────────
 *
 * Quattro tagli, ognuno espresso nell'ora locale del suo centro, che
 * partizionano la giornata UTC senza sovrapposizioni né buchi:
 *
 *   ASIA      da Tokyo 09:00 (= 00:00 UTC, sempre)  a  Londra 08:00
 *   LONDRA    da Londra 08:00                        a  New York 08:00
 *   NEW YORK  da New York 08:00                      a  New York 17:00
 *   FUORI     da New York 17:00                      a  fine giornata UTC
 *
 * Le sovrapposizioni reali fra sessioni esistono (Londra e New York
 * contrattano insieme per ore) ma un bucket deve appartenere a una sola
 * sessione: si usano quindi gli ORARI DI APERTURA come punti di taglio, che è
 * la convenzione più diffusa e l'unica che dia una partizione.
 *
 * Le etichette e le chiavi restano quelle di `lib/sessions.ts`: il vocabolario
 * dell'app è uno solo, cambiano i confini.
 */

import { SESSIONS, SESSION_LABELS } from "@/lib/sessions";
import type { SessionKey } from "@/lib/sessions";

export { SESSIONS, SESSION_LABELS };
export type { SessionKey };

export const TOKYO_TZ = "Asia/Tokyo";
export const LONDON_TZ = "Europe/London";
export const NEWYORK_TZ = "America/New_York";

/** Ora locale di apertura/chiusura di ogni taglio, nel fuso del suo centro. */
export const SESSION_ANCHORS = {
  /** Apertura della borsa di Tokyo. In UTC è sempre 00:00: il Giappone non
   * ha ora legale, ed è il motivo per cui la giornata UTC comincia proprio
   * qui senza bisogno di aggiustamenti. */
  asiaOpenTokyo: 9,
  /** Apertura di Londra. */
  londonOpenLondon: 8,
  /** Apertura di New York. */
  newYorkOpenNewYork: 8,
  /** Chiusura di New York: da qui in poi è fuori sessione. */
  newYorkCloseNewYork: 17,
} as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(ts: Date, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(ts)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/**
 * Scarto in minuti fra l'ora locale di un fuso e UTC, nell'istante dato
 * (positivo a est di Greenwich). Ricavato confrontando i componenti locali
 * con quelli UTC: non richiede tabelle di ora legale, le conosce già il
 * database IANA.
 */
export function zoneOffsetMinutes(ts: Date, timeZone: string): number {
  const local = partsIn(ts, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  // Arrotondato al minuto: `ts` può portare secondi che non interessano.
  return Math.round((asUtc - Math.floor(ts.getTime() / 60_000) * 60_000) / 60_000);
}

export interface SessionCuts {
  /** Minuti dalla mezzanotte UTC. ASIA comincia sempre a 0. */
  londonStart: number;
  newYorkStart: number;
  newYorkEnd: number;
}

/**
 * I tre tagli della giornata UTC, in minuti dalla mezzanotte.
 *
 * L'offset di ciascun centro è letto **a mezzogiorno UTC di quella data**, non
 * all'istante del confine: è un riferimento unico per tutta la giornata, così
 * due barre della stessa ora non possono finire in sessioni diverse. Le 12:00
 * UTC vanno bene perché tutti i cambi d'ora reali avvengono prima — l'Unione
 * Europea alle 01:00 UTC, gli Stati Uniti fra le 06:00 e le 07:00 UTC.
 */
export function sessionCutsForDay(utcDate: Date): SessionCuts {
  const noon = new Date(
    Date.UTC(
      utcDate.getUTCFullYear(),
      utcDate.getUTCMonth(),
      utcDate.getUTCDate(),
      12,
    ),
  );
  const london = zoneOffsetMinutes(noon, LONDON_TZ);
  const newYork = zoneOffsetMinutes(noon, NEWYORK_TZ);
  return {
    londonStart: SESSION_ANCHORS.londonOpenLondon * 60 - london,
    newYorkStart: SESSION_ANCHORS.newYorkOpenNewYork * 60 - newYork,
    newYorkEnd: SESSION_ANCHORS.newYorkCloseNewYork * 60 - newYork,
  };
}

/**
 * Sessione di mercato di un istante. La partizione è contigua: ogni minuto
 * della giornata UTC appartiene a esattamente una sessione.
 */
export function marketSessionOf(ts: Date): SessionKey {
  const cuts = sessionCutsForDay(ts);
  const minuteOfDay = ts.getUTCHours() * 60 + ts.getUTCMinutes();
  if (minuteOfDay < cuts.londonStart) return "ASIA";
  if (minuteOfDay < cuts.newYorkStart) return "LONDON";
  if (minuteOfDay < cuts.newYorkEnd) return "NEWYORK";
  return "OFF";
}

/** Indice numerico della sessione, come salvato nel campo `bucket`. */
export function marketSessionBucket(ts: Date): number {
  return SESSIONS.indexOf(marketSessionOf(ts));
}

/**
 * Confini della giornata in ore piene, per la legenda: due varianti, una per
 * combinazione di ora solare/legale, perché è esattamente ciò che l'utente
 * deve poter vedere invece di un orario unico che sarebbe falso metà anno.
 */
export interface SessionBoundaryLabel {
  session: SessionKey;
  /** "07:00 → 12:00" nel fuso richiesto. */
  range: string;
}

function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Confini delle quattro sessioni per una data specifica, espressi nel fuso di
 * visualizzazione richiesto (UTC oppure Europe/Rome).
 */
export function sessionBoundaries(
  utcDate: Date,
  displayTimeZone: string,
): SessionBoundaryLabel[] {
  const cuts = sessionCutsForDay(utcDate);
  const shift =
    displayTimeZone === "UTC"
      ? 0
      : zoneOffsetMinutes(
          new Date(
            Date.UTC(
              utcDate.getUTCFullYear(),
              utcDate.getUTCMonth(),
              utcDate.getUTCDate(),
              12,
            ),
          ),
          displayTimeZone,
        );
  const edges = [0, cuts.londonStart, cuts.newYorkStart, cuts.newYorkEnd, 1440];
  return SESSIONS.map((session, i) => ({
    session,
    range: `${hhmm(edges[i] + shift)} → ${hhmm(edges[i + 1] + shift)}`,
  }));
}
