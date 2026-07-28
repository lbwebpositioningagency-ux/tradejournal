"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradingAccountSchema } from "@/lib/validations/account";
import { ACTIVE_ACCOUNT_COOKIE, ALL_ACCOUNTS } from "@/lib/constants";

export type AccountFormState = { error?: string; success?: boolean } | undefined;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

function parseAccountForm(formData: FormData) {
  const parsed = tradingAccountSchema.safeParse({
    name: formData.get("name"),
    broker: formData.get("broker") ?? "",
    currency: formData.get("currency"),
    initialBalance: formData.get("initialBalance") || "0",
    // F36 — regole prop: vuoto = regola spenta (null azzera anche su update).
    propDailyLossLimit: formData.get("propDailyLossLimit") ?? "",
    propMaxDrawdown: formData.get("propMaxDrawdown") ?? "",
    propDrawdownType: formData.get("propDrawdownType") || "STATIC",
    propProfitTarget: formData.get("propProfitTarget") ?? "",
    propMinTradingDays: formData.get("propMinTradingDays") ?? "",
  });
  if (!parsed.success) return parsed;
  // Il tipo di drawdown ha senso solo con un max DD attivo.
  if (parsed.data.propMaxDrawdown === null) {
    return {
      success: true as const,
      data: { ...parsed.data, propDrawdownType: null },
    };
  }
  return parsed;
}

export async function createAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const userId = await requireUserId();
  const parsed = parseAccountForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const duplicate = await prisma.tradingAccount.findUnique({
    where: { userId_name: { userId, name: parsed.data.name } },
  });
  if (duplicate) {
    return { error: "Hai già un conto con questo nome" };
  }

  await prisma.tradingAccount.create({
    data: { userId, ...parsed.data },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateAccountAction(
  accountId: string,
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const userId = await requireUserId();
  const parsed = parseAccountForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const duplicate = await prisma.tradingAccount.findUnique({
    where: { userId_name: { userId, name: parsed.data.name } },
  });
  if (duplicate && duplicate.id !== accountId) {
    return { error: "Hai già un conto con questo nome" };
  }

  // updateMany con filtro userId: impedisce di toccare conti di altri utenti.
  const result = await prisma.tradingAccount.updateMany({
    where: { id: accountId, userId },
    data: parsed.data,
  });
  if (result.count === 0) {
    return { error: "Conto non trovato" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function setAccountArchivedAction(
  accountId: string,
  archived: boolean,
): Promise<AccountFormState> {
  const userId = await requireUserId();
  const result = await prisma.tradingAccount.updateMany({
    where: { id: accountId, userId },
    data: { isArchived: archived },
  });
  if (result.count === 0) return { error: "Conto non trovato" };

  const store = await cookies();
  if (store.get(ACTIVE_ACCOUNT_COOKIE)?.value === accountId) {
    store.set(ACTIVE_ACCOUNT_COOKIE, ALL_ACCOUNTS, { path: "/" });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteAccountAction(accountId: string): Promise<AccountFormState> {
  const userId = await requireUserId();

  const count = await prisma.tradingAccount.count({ where: { userId } });
  if (count <= 1) {
    return { error: "Non puoi eliminare l'unico conto: creane prima un altro" };
  }

  const result = await prisma.tradingAccount.deleteMany({
    where: { id: accountId, userId },
  });
  if (result.count === 0) return { error: "Conto non trovato" };

  const store = await cookies();
  if (store.get(ACTIVE_ACCOUNT_COOKIE)?.value === accountId) {
    store.set(ACTIVE_ACCOUNT_COOKIE, ALL_ACCOUNTS, { path: "/" });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function setActiveAccountAction(accountId: string): Promise<void> {
  const userId = await requireUserId();

  if (accountId !== ALL_ACCOUNTS) {
    const account = await prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) return;
  }

  const store = await cookies();
  store.set(ACTIVE_ACCOUNT_COOKIE, accountId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
