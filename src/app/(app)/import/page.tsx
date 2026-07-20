import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId } from "@/lib/active-account";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [accounts, profiles, activeAccountId] = await Promise.all([
    prisma.tradingAccount.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.importProfile.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mapping: true },
    }),
    getActiveAccountId(),
  ]);

  if (accounts.length === 0) redirect("/settings/accounts");

  const defaultAccountId =
    activeAccountId !== ALL_ACCOUNTS && accounts.some((a) => a.id === activeAccountId)
      ? activeAccountId
      : accounts[0].id;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="page-title">Import CSV</h1>
        <p className="text-sm text-muted-foreground">
          Importa i trade dall&apos;export del tuo broker: mappa le colonne, controlla
          l&apos;anteprima e conferma.
        </p>
      </div>
      <ImportWizard
        accounts={accounts}
        profiles={profiles}
        defaultAccountId={defaultAccountId}
      />
    </div>
  );
}
