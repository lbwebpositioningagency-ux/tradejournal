"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_IMPORT_ROWS, persistTradeInputs } from "@/lib/import-core";
import type { TradeInput } from "@/lib/validations/trade";
import {
  importProfileSchema,
  type ImportProfileInput,
} from "@/lib/validations/import";

export type ImportResult =
  | { error: string }
  | { success: true; imported: number; failed: { row: number; error: string }[] };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Importa una lista di trade (già costruiti dal wizard client con
 * buildTradeInput). La pipeline Zod → computeTrade → Prisma vive in
 * src/lib/import-core.ts, CONDIVISA col sync MT5: qui restano solo auth,
 * ownership del conto e revalidate.
 */
export async function importTradesAction(
  tradingAccountId: string,
  rows: TradeInput[],
): Promise<ImportResult> {
  const userId = await requireUserId();

  if (rows.length === 0) return { error: "Nessuna riga da importare" };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `Massimo ${MAX_IMPORT_ROWS} righe per import` };
  }

  const account = await prisma.tradingAccount.findFirst({
    where: { id: tradingAccountId, userId },
    select: { id: true },
  });
  if (!account) return { error: "Conto non trovato" };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  const result = await persistTradeInputs({
    userId,
    tradingAccountId,
    timezone: user.timezone,
    rows: rows.map((input) => ({ input })),
  });

  revalidatePath("/trades");
  return { success: true, imported: result.imported, failed: result.failed };
}

// ───────────────────────── Profili di mapping ─────────────────────────

export type ProfileActionResult = { error?: string; success?: boolean };

export async function saveImportProfileAction(
  input: ImportProfileInput,
): Promise<ProfileActionResult> {
  const userId = await requireUserId();

  const parsed = importProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Profilo non valido" };
  }

  await prisma.importProfile.upsert({
    where: { userId_name: { userId, name: parsed.data.name } },
    update: { mapping: parsed.data.mapping },
    create: { userId, name: parsed.data.name, mapping: parsed.data.mapping },
  });

  revalidatePath("/import");
  return { success: true };
}

export async function deleteImportProfileAction(
  profileId: string,
): Promise<ProfileActionResult> {
  const userId = await requireUserId();

  const result = await prisma.importProfile.deleteMany({
    where: { id: profileId, userId },
  });
  if (result.count === 0) return { error: "Profilo non trovato" };

  revalidatePath("/import");
  return { success: true };
}
