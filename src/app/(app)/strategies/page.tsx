import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { StrategyFormDialog } from "./strategy-form-dialog";
import { StrategyRowActions } from "./strategy-row-actions";

export const metadata: Metadata = { title: "Strategies" };

export default async function StrategiesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const strategies = await prisma.strategy.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { trades: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Strategies</h1>
          <p className="text-sm text-muted-foreground">
            I tuoi setup: collegali ai trade per analizzarne la performance (FASE 8)
          </p>
        </div>
        <StrategyFormDialog mode="create" />
      </div>

      {strategies.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <Target className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nessuna strategia ancora. Creane una e collegala ai trade dal form.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {strategies.map((strategy) => (
            <Card key={strategy.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: strategy.color ?? "var(--muted-foreground)" }}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{strategy.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {strategy.description || "Nessuna descrizione"} ·{" "}
                      {strategy._count.trades} trade
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StrategyFormDialog
                    mode="edit"
                    strategy={{
                      id: strategy.id,
                      name: strategy.name,
                      description: strategy.description ?? "",
                      color: strategy.color ?? "",
                    }}
                  />
                  <StrategyRowActions
                    strategyId={strategy.id}
                    strategyName={strategy.name}
                    tradeCount={strategy._count.trades}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
