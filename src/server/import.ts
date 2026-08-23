"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  findExistingFingerprints,
  MAX_IMPORT_ROWS,
  persistTradeInputs,
  rowFingerprint,
} from "@/lib/import-core";
import type { TradeInput } from "@/lib/validations/trade";
import {
  importProfileSchema,
  type ImportProfileInput,
} from "@/lib/validations/import";

export type ImportResult =
  | { error: string }
  | {
      success: true;
      imported: number;
      /** F14 — righe skippate perché identiche a trade già presenti. */
      duplicates: number;
      failed: { row: number; error: string }[];
      /**
       * Trade con chiusura nella finestra in cui i mercati tradizionali sono
       * chiusi: segnalazione di qualità dati, non un errore di import
       * (v. lib/out-of-session.ts). Il conteggio arriva sempre; mostrarlo o
       * no lo decide la soglia lato client.
       */
      outOfSession: number;
    };

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
  options?: {
    /** F14 — default false: le righe identiche a trade esistenti si saltano. */
    importDuplicates?: boolean;
  },
): Promise<ImportResult> {
  const userId = await requireUserId();

  if (rows.length === 0) return { error: "Nessuna riga da importare" };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `Massimo ${MAX_IMPORT_ROWS} righe per import` };
  }

  const account = await prisma.tradingAccount.findFirst({
    where: { id: tradingAccountId, userId, isDemo: false },
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
    skipFingerprintDuplicates: !options?.importDuplicates,
  });

  revalidatePath("/trades");
  return {
    success: true,
    imported: result.imported,
    duplicates: result.duplicates,
    failed: result.failed,
    outOfSession: result.outOfSession,
  };
}

/**
 * F14 — conta le righe del batch identiche a trade già presenti sul conto
 * (o duplicate tra loro), per il warning in anteprima PRIMA dell'import.
 */
export async function checkImportDuplicatesAction(
  tradingAccountId: string,
  rows: TradeInput[],
): Promise<{ error?: string; duplicates?: number }> {
  const userId = await requireUserId();
  if (rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
    return { duplicates: 0 };
  }

  const account = await prisma.tradingAccount.findFirst({
    where: { id: tradingAccountId, userId, isDemo: false },
    select: { id: true },
  });
  if (!account) return { error: "Conto non trovato" };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  const seen = await findExistingFingerprints({
    tradingAccountId,
    timezone: user.timezone,
    rows,
  });
  let duplicates = 0;
  for (const input of rows) {
    const fp = rowFingerprint(input, user.timezone);
    if (fp === null) continue;
    if (seen.has(fp)) duplicates += 1;
    else seen.add(fp);
  }
  return { duplicates };
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
