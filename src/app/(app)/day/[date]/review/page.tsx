import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Decimal from "decimal.js";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveAccountId, tradeAccountWhere } from "@/lib/active-account";
import { addDays, isValidDateKey } from "@/lib/calendar";
import { zonedInputToUtc } from "@/lib/dates";
import { profitFactor, winRate } from "@/lib/metrics";
import { formatPercent, formatRMultiple, formatSignedMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { ReviewWizard } from "./review-wizard";

export const metadata: Metadata = { title: "Revisione guidata" };

/**
 * W5 — revisione guidata di fine giornata: i trade del giorno uno a uno
 * (strategia, tag, valutazione, una riga di nota) e chiusura col Post-Market
 * precompilato con le statistiche REALI del giorno. Il rito serale in 3 minuti.
 */
export default async function DayReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { date } = await params;
  if (!isValidDateKey(date)) notFound();

  const [user, activeAccountId] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    }),
    getActiveAccountId(),
  ]);

  const start = zonedInputToUtc(`${date}T00:00`, user.timezone);
  const end = zonedInputToUtc(`${addDays(date, 1)}T00:00`, user.timezone);
  const accountWhere = tradeAccountWhere(userId, activeAccountId);

  const [trades, strategies, tags, postmarket] = await Promise.all([
    prisma.trade.findMany({
      where: { ...accountWhere, status: "CLOSED", closedAt: { gte: start, lt: end } },
      orderBy: { closedAt: "asc" },
      include: {
        account: { select: { currency: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    }),
    prisma.strategy.findMany({
      where: { userId, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.note.findFirst({
      where: {
        userId,
        type: "DAILY",
        dayDate: new Date(`${date}T00:00:00.000Z`),
        dayPhase: "POSTMARKET",
      },
      select: { content: true },
    }),
  ]);

  // Statistiche del giorno per il template Post-Market (Decimal-safe).
  let net = new Decimal(0);
  let wins = 0;
  let losses = 0;
  let winSum = new Decimal(0);
  let lossSum = new Decimal(0);
  for (const trade of trades) {
    const pnl = new Decimal(trade.netPnl.toString());
    net = net.plus(pnl);
    if (pnl.gt(0)) {
      wins += 1;
      winSum = winSum.plus(pnl);
    } else if (pnl.lt(0)) {
      losses += 1;
      lossSum = lossSum.plus(pnl);
    }
  }
  const currency = trades[0]?.account.currency ?? "USD";
  const pf = profitFactor(winSum.toFixed(2), lossSum.toFixed(2));
  const rate = winRate(wins, trades.length);
  const statsTemplate =
    trades.length === 0
      ? ""
      : [
          `Bilancio: ${formatSignedMoney(net.toFixed(2), currency)} · ${trades.length} trade (${wins}W/${losses}L) · Win ${formatPercent(rate)} · PF ${pf !== null ? formatRMultiple(pf).slice(0, -1) : wins > 0 ? "∞" : "—"}`,
          "",
          "Cosa ho fatto bene:",
          "",
          "Cosa evitare domani:",
          "",
        ].join("\n");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Torna alla giornata">
          <Link href={`/day/${date}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="page-title">Revisione guidata</h1>
          <p className="page-subtitle">
            {date.split("-").reverse().join("/")} · {trades.length} trade da rivedere
          </p>
        </div>
      </div>

      <ReviewWizard
        date={date}
        trades={trades.map((trade) => ({
          id: trade.id,
          symbol: trade.symbol,
          direction: trade.direction,
          netPnl: trade.netPnl.toString(),
          rMultiple: trade.rMultiple?.toString() ?? null,
          currency: trade.account.currency,
          strategyId: trade.strategyId ?? "",
          rating: trade.rating,
          tags: trade.tags.map(({ tag }) => tag.name),
        }))}
        strategies={strategies}
        tagSuggestions={tags.map((t) => t.name)}
        postmarketInitial={postmarket?.content ?? statsTemplate}
      />
    </div>
  );
}
