import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId } from "@/lib/active-account";
import { utcToZonedInput } from "@/lib/dates";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { TradeForm } from "@/components/trades/trade-form";

export const metadata: Metadata = { title: "Nuovo trade" };

export default async function NewTradePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [user, accounts, strategies, activeAccountId] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    }),
    prisma.tradingAccount.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.strategy.findMany({
      where: { userId, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getActiveAccountId(),
  ]);

  if (accounts.length === 0) redirect("/settings/accounts");

  const defaultAccountId =
    activeAccountId !== ALL_ACCOUNTS && accounts.some((a) => a.id === activeAccountId)
      ? activeAccountId
      : accounts[0].id;

  const now = utcToZonedInput(new Date(), user.timezone);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="page-title mb-6">Nuovo trade</h1>
      <TradeForm
        mode="create"
        accounts={accounts}
        strategies={strategies}
        initialValues={{
          tradingAccountId: defaultAccountId,
          symbol: "",
          assetClass: "STOCK",
          pointValue: "1",
          initialRisk: "",
          plannedStop: "",
          plannedTarget: "",
          strategyId: "",
          rating: "",
          notes: "",
          tags: "",
          executions: [
            { side: "BUY", quantity: "", price: "", fee: "0", executedAt: now },
          ],
        }}
      />
    </div>
  );
}
