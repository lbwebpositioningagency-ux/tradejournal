import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Guardia OBBLIGATORIA per ogni script che SCRIVE o CANCELLA dati (seed,
 * backfill, cleanup, sonde di scrittura). Non è codice dell'app: vive qui
 * perché sia importabile sia da `prisma/*.ts` sia da `scripts/*.ts`, che già
 * risolvono `../src/...`.
 *
 * Il rischio che chiude: uno script "locale" che si connette a `DATABASE_URL`
 * senza guardarla. Basta avere la stringa di produzione nell'ambiente — o un
 * fallback hardcoded che maschera l'assenza della variabile — e la scrittura
 * finisce su Neon. L'app non ha una funzione di eliminazione account: un
 * conto creato per sbaglio in produzione si toglie solo a mano dal database.
 *
 * Regola:
 * - `DATABASE_URL` assente, vuota o non interpretabile → lo script MUORE.
 *   Mai un default, mai un `?? "postgresql://…localhost…"`: indovinare è
 *   esattamente il comportamento che ha reso possibile l'incidente sfiorato;
 * - host non locale → lo script MUORE, dicendo su quale host stava per
 *   scrivere;
 * - unica deroga: `ALLOW_REMOTE_DB=1` nell'ambiente, che è una scelta
 *   esplicita di chi lancia il comando (serve ai backfill di produzione).
 *   Anche in quel caso l'host viene stampato prima di procedere.
 */

/** Variabile d'ambiente che autorizza — solo se vale "1" — un host remoto. */
export const REMOTE_DB_OVERRIDE = "ALLOW_REMOTE_DB";

/**
 * Host considerati locali. Insieme CHIUSO: qualunque altro nome è remoto
 * finché non lo si dichiara, compresi gli alias di comodo tipo "db" o
 * "host.docker.internal" — che possono benissimo essere un tunnel.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  // tutta la 127.0.0.0/8 è loopback, non solo 127.0.0.1
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Stringa di connessione con la password sostituita, per poterla stampare nei
 * messaggi di errore: l'host DEVE restare leggibile, è l'informazione che
 * serve a capire dove si stava per scrivere.
 */
export function maskDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "<stringa di connessione non interpretabile>";
  }
}

/**
 * Restituisce la connection string SOLO se è lecito scriverci, altrimenti
 * lancia. `purpose` finisce nei messaggi: serve a capire quale script si è
 * fermato quando ne gira più d'uno.
 */
export function resolveWritableDatabaseUrl(purpose: string): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      `[${purpose}] DATABASE_URL non impostata. Nessun valore di ripiego: ` +
        "passala esplicitamente, es. " +
        'DATABASE_URL="postgresql://tradejournal:tradejournal@localhost:5432/tradejournal".',
    );
  }

  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    throw new Error(
      `[${purpose}] DATABASE_URL non è una URL valida: impossibile stabilire ` +
        "su quale host si scriverebbe, quindi non si procede.",
    );
  }

  if (isLocalDatabaseHost(hostname)) return raw;

  if (process.env[REMOTE_DB_OVERRIDE] === "1") {
    console.warn(
      `[${purpose}] ATTENZIONE: scrittura su database REMOTO autorizzata da ` +
        `${REMOTE_DB_OVERRIDE}=1 → ${maskDatabaseUrl(raw)}`,
    );
    return raw;
  }

  throw new Error(
    `[${purpose}] STOP: DATABASE_URL punta a un host NON locale ` +
      `(${hostname}) e questo script scrive dati. ` +
      `Se è voluto rilancia con ${REMOTE_DB_OVERRIDE}=1, ` +
      "altrimenti punta la variabile al Postgres locale (npm run db:up).",
  );
}

/**
 * Scorciatoia da usare al posto di `new PrismaPg({ connectionString: ... })`
 * in ogni script che scrive: una riga sola, così la guardia non si dimentica.
 */
export function guardedPgAdapter(purpose: string): PrismaPg {
  return new PrismaPg({ connectionString: resolveWritableDatabaseUrl(purpose) });
}
