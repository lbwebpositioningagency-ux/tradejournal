import { prisma } from "@/lib/db";
import {
  effectiveRules,
  type EffectiveRule,
  type StoredRule,
} from "@/lib/discipline/catalog";

/**
 * Regole effettive dell'utente della SESSIONE (mai dell'utente di sistema che
 * possiede SIM1): catalogo con sopra la configurazione salvata.
 */
export async function getEffectiveRules(sessionUserId: string): Promise<EffectiveRule[]> {
  const rows = await prisma.disciplineRule.findMany({
    where: { userId: sessionUserId },
    include: { currencyLimits: true, symbolLimits: true },
  });
  const stored: StoredRule[] = rows.map((r) => ({
    type: r.type,
    isActive: r.isActive,
    rValue: r.rValue?.toString() ?? null,
    countValue: r.countValue,
    minutesValue: r.minutesValue,
    sessions: r.sessions,
    allowWeekend: r.allowWeekend,
    currencyLimits: r.currencyLimits.map((l) => ({ currency: l.currency, amount: l.amount.toFixed(2) })),
    symbolLimits: r.symbolLimits.map((l) => ({ symbol: l.symbol, quantity: l.quantity.toString() })),
  }));
  return effectiveRules(stored);
}
