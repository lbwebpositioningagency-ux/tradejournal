import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { utcToZonedInput } from "@/lib/dates";
import { TradeForm, type ExecutionRow } from "@/components/trades/trade-form";

export const metadata: Metadata = { title: "Modifica trade" };

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export default async function EditTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { id } = await params;

  const [user, trade, accounts, strategies] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    }),
    prisma.trade.findFirst({
      where: { id, account: { userId } },
      include: {
        executions: { orderBy: { executedAt: "asc" } },
        tags: { include: { tag: { select: { name: true } } } },
        notes: { where: { type: "TRADE" }, orderBy: { createdAt: "asc" } },
      },
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
  ]);

  if (!trade) notFound();

  const executions: ExecutionRow[] = trade.executions.map((execution) => ({
    side: execution.side,
    quantity: trimZeros(execution.quantity.toString()),
    price: trimZeros(execution.price.toString()),
    fee: trimZeros(execution.fee.toString()),
    executedAt: utcToZonedInput(execution.executedAt, user.timezone),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="page-title mb-6">
        Modifica trade {trade.symbol}
      </h1>
      <TradeForm
        mode="edit"
        tradeId={trade.id}
        accounts={accounts}
        strategies={strategies}
        initialValues={{
          tradingAccountId: trade.tradingAccountId,
          symbol: trade.symbol,
          assetClass: trade.assetClass,
          pointValue: trimZeros(trade.pointValue.toString()),
          initialRisk: trade.initialRisk ? trimZeros(trade.initialRisk.toString()) : "",
          plannedStop: trade.plannedStop ? trimZeros(trade.plannedStop.toString()) : "",
          plannedTarget: trade.plannedTarget
            ? trimZeros(trade.plannedTarget.toString())
            : "",
          strategyId: trade.strategyId ?? "",
          rating: trade.rating ? String(trade.rating) : "",
          notes: trade.notes.map((note) => note.content).join("\n\n"),
          tags: trade.tags.map(({ tag }) => tag.name).join(", "),
          executions,
        }}
      />
    </div>
  );
}
