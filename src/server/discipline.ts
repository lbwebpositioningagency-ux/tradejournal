"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DISCIPLINE_RULE_TYPES, type DisciplineRuleType } from "@/lib/discipline/catalog";
import { resetDisciplineRule, saveDisciplineRule } from "@/lib/discipline/store";
import { disciplineRuleSchema } from "@/lib/validations/discipline";

export type DisciplineRuleFormState = { error?: string; success?: boolean } | undefined;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Salva la configurazione di una regola. Le regole sono dell'UTENTE della
 * sessione — mai del conto attivo: anche guardando il demo SIM1 si scrive
 * sulle proprie regole, e SIM1 resta in sola lettura.
 */
export async function saveDisciplineRuleAction(
  input: unknown,
): Promise<DisciplineRuleFormState> {
  const userId = await requireUserId();
  const parsed = disciplineRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  await saveDisciplineRule(userId, parsed.data);
  revalidatePath("/progress", "layout");
  return { success: true };
}

/** Torna ai valori di partenza del catalogo. */
export async function resetDisciplineRuleAction(
  type: DisciplineRuleType,
): Promise<DisciplineRuleFormState> {
  const userId = await requireUserId();
  if (!(DISCIPLINE_RULE_TYPES as readonly string[]).includes(type)) {
    return { error: "Regola sconosciuta" };
  }
  await resetDisciplineRule(userId, type);
  revalidatePath("/progress", "layout");
  return { success: true };
}
