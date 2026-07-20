"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { strategySchema } from "@/lib/validations/strategy";

export type StrategyFormState = { error?: string; success?: boolean } | undefined;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

function parseStrategyForm(formData: FormData) {
  return strategySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    color: formData.get("color") ?? "",
  });
}

export async function createStrategyAction(
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const userId = await requireUserId();
  const parsed = parseStrategyForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const duplicate = await prisma.strategy.findUnique({
    where: { userId_name: { userId, name: parsed.data.name } },
  });
  if (duplicate) return { error: "Hai già una strategia con questo nome" };

  await prisma.strategy.create({ data: { userId, ...parsed.data } });

  revalidatePath("/strategies");
  return { success: true };
}

export async function updateStrategyAction(
  strategyId: string,
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const userId = await requireUserId();
  const parsed = parseStrategyForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const duplicate = await prisma.strategy.findUnique({
    where: { userId_name: { userId, name: parsed.data.name } },
  });
  if (duplicate && duplicate.id !== strategyId) {
    return { error: "Hai già una strategia con questo nome" };
  }

  const result = await prisma.strategy.updateMany({
    where: { id: strategyId, userId },
    data: parsed.data,
  });
  if (result.count === 0) return { error: "Strategia non trovata" };

  revalidatePath("/strategies");
  return { success: true };
}

export async function deleteStrategyAction(
  strategyId: string,
): Promise<StrategyFormState> {
  const userId = await requireUserId();

  // I trade collegati restano (strategyId → SetNull).
  const result = await prisma.strategy.deleteMany({
    where: { id: strategyId, userId },
  });
  if (result.count === 0) return { error: "Strategia non trovata" };

  revalidatePath("/strategies");
  revalidatePath("/trades");
  return { success: true };
}
