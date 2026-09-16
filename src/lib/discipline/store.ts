import { prisma } from "@/lib/db";
import type { DisciplineRuleType } from "./catalog";
import type { DisciplineRuleData } from "@/lib/validations/discipline";

/**
 * Scrittura della configurazione di una regola. Sempre sull'utente passato —
 * quello della SESSIONE: le regole non appartengono mai al conto attivo.
 * Le soglie si sostituiscono in blocco: sono poche e la form le manda tutte.
 */
export async function saveDisciplineRule(userId: string, data: DisciplineRuleData): Promise<void> {
  const { type, currencyLimits, symbolLimits, ...params } = data;
  await prisma.$transaction(async (tx) => {
    const rule = await tx.disciplineRule.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, ...params },
      update: params,
      select: { id: true },
    });
    await tx.disciplineRuleCurrencyLimit.deleteMany({ where: { ruleId: rule.id } });
    await tx.disciplineRuleSymbolLimit.deleteMany({ where: { ruleId: rule.id } });
    if (currencyLimits.length > 0) {
      await tx.disciplineRuleCurrencyLimit.createMany({
        data: currencyLimits.map((l) => ({ ruleId: rule.id, ...l })),
      });
    }
    if (symbolLimits.length > 0) {
      await tx.disciplineRuleSymbolLimit.createMany({
        data: symbolLimits.map((l) => ({ ruleId: rule.id, ...l })),
      });
    }
  });
}

/** Torna ai valori di partenza del catalogo: si cancella la riga (le soglie vanno in cascata). */
export async function resetDisciplineRule(userId: string, type: DisciplineRuleType): Promise<void> {
  await prisma.disciplineRule.deleteMany({ where: { userId, type } });
}
