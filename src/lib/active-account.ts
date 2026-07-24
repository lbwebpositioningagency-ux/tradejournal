import { cookies } from "next/headers";
import { ACTIVE_ACCOUNT_COOKIE, ALL_ACCOUNTS } from "@/lib/constants";

/** Id del conto attivo dal cookie (ALL_ACCOUNTS = tutti i conti). */
export async function getActiveAccountId(): Promise<string> {
  const store = await cookies();
  return store.get(ACTIVE_ACCOUNT_COOKIE)?.value ?? ALL_ACCOUNTS;
}

/**
 * Filtro Prisma per i trade dell'utente rispettando il conto attivo.
 * Filtra SEMPRE per userId attraverso la relazione account; con "Tutti i
 * conti" esclude gli archiviati, come dashboard/calendario/stats/reports.
 *
 * `currency` opzionale (F6): restringe alla valuta indicata — in vista "Tutti
 * i conti" con più valute non si sommano mai valute diverse.
 */
export function tradeAccountWhere(
  userId: string,
  activeAccountId: string,
  currency?: string,
) {
  const account: { userId: string; isArchived?: boolean; currency?: string } = {
    userId,
  };
  if (activeAccountId === ALL_ACCOUNTS) account.isArchived = false;
  if (currency) account.currency = currency;
  return activeAccountId === ALL_ACCOUNTS
    ? { account }
    : { tradingAccountId: activeAccountId, account };
}
