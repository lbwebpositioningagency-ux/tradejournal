"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mt5SourceSchema, type Mt5SourceInput } from "@/lib/validations/mt5";

export type Mt5ActionResult = { error?: string; success?: boolean };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/** Crea/aggiorna la sorgente di sync del conto (una per conto). */
export async function saveMt5SourceAction(
  input: Mt5SourceInput,
): Promise<Mt5ActionResult> {
  const userId = await requireUserId();

  const parsed = mt5SourceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const data = parsed.data;

  const account = await prisma.tradingAccount.findFirst({
    where: { id: data.tradingAccountId, userId },
    select: { id: true },
  });
  if (!account) return { error: "Conto non trovato" };

  await prisma.mt5SyncSource.upsert({
    where: { tradingAccountId: data.tradingAccountId },
    update: {
      filePath: data.filePath,
      assetClass: data.assetClass,
      enabled: data.enabled,
    },
    create: {
      userId,
      tradingAccountId: data.tradingAccountId,
      filePath: data.filePath,
      assetClass: data.assetClass,
      enabled: data.enabled,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteMt5SourceAction(
  sourceId: string,
): Promise<Mt5ActionResult> {
  const userId = await requireUserId();

  const result = await prisma.mt5SyncSource.deleteMany({
    where: { id: sourceId, userId },
  });
  if (result.count === 0) return { error: "Sorgente non trovata" };

  revalidatePath("/settings");
  return { success: true };
}
