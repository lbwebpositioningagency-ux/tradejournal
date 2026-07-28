import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AccountFormDialog } from "./account-form-dialog";
import { AccountRowActions } from "./account-row-actions";

export const metadata: Metadata = { title: "Conti di trading" };

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const accounts = await prisma.tradingAccount.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { trades: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Conti di trading</h1>
          <p className="text-sm text-muted-foreground">
            I trade importati o inseriti a mano appartengono sempre a un conto
          </p>
        </div>
        <AccountFormDialog mode="create" />
      </div>

      <div className="flex flex-col gap-3">
        {accounts.map((account) => (
          <Card key={account.id} className={account.isArchived ? "opacity-60" : undefined}>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{account.name}</span>
                  {account.isArchived ? <Badge variant="secondary">Archiviato</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {account.broker ? `${account.broker} · ` : ""}
                  Saldo iniziale {formatMoney(account.initialBalance.toString(), account.currency)} ·{" "}
                  {account._count.trades} trade
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <AccountFormDialog
                  mode="edit"
                  account={{
                    id: account.id,
                    name: account.name,
                    broker: account.broker ?? "",
                    currency: account.currency,
                    initialBalance: account.initialBalance.toString(),
                    propDailyLossLimit:
                      account.propDailyLossLimit?.toString() ?? "",
                    propMaxDrawdown: account.propMaxDrawdown?.toString() ?? "",
                    propDrawdownType: account.propDrawdownType ?? "STATIC",
                    propProfitTarget: account.propProfitTarget?.toString() ?? "",
                    propMinTradingDays:
                      account.propMinTradingDays !== null
                        ? String(account.propMinTradingDays)
                        : "",
                  }}
                />
                <AccountRowActions
                  accountId={account.id}
                  accountName={account.name}
                  isArchived={account.isArchived}
                  tradeCount={account._count.trades}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
