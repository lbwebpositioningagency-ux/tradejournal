import { prisma } from "@/lib/db";
import { ALL_ACCOUNTS, DEMO_READONLY_MESSAGE } from "@/lib/constants";
import { getActiveAccountId } from "@/lib/active-account";

export {
  DEMO_ACCOUNT_NAME,
  DEMO_READONLY_MESSAGE,
  DEMO_USER_EMAIL,
} from "@/lib/constants";

/**
 * CONTO DEMO GLOBALE "SIM1" (Opzione A).
 *
 * Un solo conto demo per l'intera istanza, di proprietà di un UTENTE DI
 * SISTEMA (`DEMO_USER_EMAIL`), visibile in SOLA LETTURA a tutti gli utenti.
 * Serve a esplorare ogni metrica senza aspettare di accumulare trade propri,
 * ed è la GOLDEN FIXTURE dei test (vedi prisma/seed-sim1.ts).
 *
 * Perché un utente di sistema e non un flag "globale" letto ovunque: tutte le
 * query dell'app filtrano per `userId` (regola di sicurezza del progetto).
 * Invece di infilare un `OR isDemo` in ogni query — con il rischio, un giorno,
 * di far entrare i trade demo nelle metriche reali di qualcuno — qui si
 * cambia UNA cosa sola: quale userId usare per le query sui TRADE quando il
 * conto attivo è SIM1. Il resto del codice resta identico e continua a
 * filtrare per userId come sempre.
 *
 * Conseguenze volute:
 * - SIM1 NON compare mai in "Tutti i conti" dell'utente (appartiene a un
 *   altro userId): entra in scena solo se selezionato esplicitamente;
 * - le scritture sono impossibili perché ogni action ricava lo userId dalla
 *   sessione e le query di ownership filtrano su di esso (in più c'è la
 *   guardia esplicita `assertWritableAccount`, difesa in profondità testata);
 * - gli artefatti PERSONALI (journal di giornata, allegati, layout dashboard,
 *   impostazioni) restano SEMPRE dell'utente vero, anche in scope demo: il
 *   journal appartiene al trader, non al conto.
 */

/**
 * Scope delle query sui TRADE. `userId` è l'utente da usare per le
 * aggregazioni e le liste di trade: in modalità demo è l'utente di sistema.
 */
export interface TradeScope {
  /** userId per le query su trade/metriche (NON per gli artefatti personali). */
  userId: string;
  /** Id conto attivo, oppure ALL_ACCOUNTS. */
  accountId: string;
  /** True quando il conto attivo è il demo globale: la UI va in sola lettura. */
  isDemo: boolean;
}

export interface DemoAccountRef {
  id: string;
  name: string;
  currency: string;
  userId: string;
}

/**
 * Il conto demo globale, se esiste (l'istanza può non averlo seminato).
 * Query per flag, non per nome: il nome è solo l'etichetta.
 */
export async function getDemoAccount(): Promise<DemoAccountRef | null> {
  return prisma.tradingAccount.findFirst({
    where: { isDemo: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true, userId: true },
  });
}

/**
 * Risolve lo scope dei trade dal cookie del conto attivo.
 *
 * `sessionUserId` è l'utente loggato; il valore tornato in `userId` è quello
 * da passare alle query sui trade — che coincide con la sessione tranne
 * quando il conto attivo è SIM1.
 */
export async function resolveTradeScope(
  sessionUserId: string,
): Promise<TradeScope> {
  const accountId = await getActiveAccountId();
  if (accountId === ALL_ACCOUNTS) {
    return { userId: sessionUserId, accountId: ALL_ACCOUNTS, isDemo: false };
  }

  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, isDemo: true },
  });

  // Conto inesistente, o di un altro utente e NON demo: si ricade su "tutti i
  // conti" dell'utente — mai un accesso a dati altrui via cookie manomesso.
  if (!account || (account.userId !== sessionUserId && !account.isDemo)) {
    return { userId: sessionUserId, accountId: ALL_ACCOUNTS, isDemo: false };
  }

  return account.isDemo
    ? { userId: account.userId, accountId: account.id, isDemo: true }
    : { userId: sessionUserId, accountId: account.id, isDemo: false };
}

/**
 * Guardia di scrittura (difesa in profondità): rifiuta qualunque operazione
 * su un conto demo. Le action già filtrano per userId — questa guardia rende
 * l'intenzione esplicita e testabile, e copre eventuali percorsi futuri.
 */
export async function assertWritableAccount(accountId: string): Promise<void> {
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: { isDemo: true },
  });
  if (account?.isDemo) throw new Error(DEMO_READONLY_MESSAGE);
}
