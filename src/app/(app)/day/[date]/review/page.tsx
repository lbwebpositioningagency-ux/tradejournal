import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeAccountWhere } from "@/lib/active-account";
import { resolveTradeScope } from "@/lib/demo-account";
import { addDays, isValidDateKey } from "@/lib/calendar";
import { zonedInputToUtc } from "@/lib/dates";
import { reviewBalanceLines, withCurrencyParam } from "@/lib/currency-nav";
import { ReviewWizard } from "./review-wizard";

export const metadata: Metadata = { title: "Revisione guidata" };

/**
 * W5 — revisione guidata di fine giornata: i trade del giorno uno a uno
 * (strategia, tag, valutazione, una riga di nota) e chiusura col Post-Market
 * precompilato con le statistiche REALI del giorno. Il rito serale in 3 minuti.
 *
 * VALUTE: la revisione mostra TUTTI i trade della giornata, perché
 * classificarli non somma denaro. Il bilancio del Post-Market sì, e quindi si
 * scrive una riga per valuta (`reviewBalanceLines`): prima sommava euro e
 * dollari e ci metteva accanto la valuta del primo trade.
 */
export default async function DayReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ cur?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { date } = await params;
  if (!isValidDateKey(date)) notFound();
  const { cur } = await searchParams;
  const dayHref = withCurrencyParam(`/day/${date}`, typeof cur === "string" ? cur : undefined);

  const [user, tradeScope] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    }),
    resolveTradeScope(userId),
  ]);

  // La revisione SCRIVE sui trade: sul conto demo (sola lettura) non ha senso
  // aprirla nemmeno per sbaglio — si torna alla Day View.
  if (tradeScope.isDemo) redirect(dayHref);
  const activeAccountId = tradeScope.accountId;

  const start = zonedInputToUtc(`${date}T00:00`, user.timezone);
  const end = zonedInputToUtc(`${addDays(date, 1)}T00:00`, user.timezone);
  const accountWhere = tradeAccountWhere(userId, activeAccountId);

  const [trades, strategies, tags, postmarket] = await Promise.all([
    prisma.trade.findMany({
      where: { ...accountWhere, status: "CLOSED", closedAt: { gte: start, lt: end } },
      orderBy: { closedAt: "asc" },
      include: {
        account: { select: { currency: true } },
        tags: { include: { tag: { select: { name: true, category: true } } } },
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
      select: { name: true, category: true },
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

  // Statistiche del giorno per il template Post-Market: una riga per valuta.
  const statsTemplate =
    trades.length === 0
      ? ""
      : [
          ...reviewBalanceLines(
            trades.map((t) => ({ netPnl: t.netPnl.toString(), currency: t.account.currency })),
          ),
          "",
          "Cosa ho fatto bene:",
          "",
          "Cosa evitare domani:",
          "",
        ].join("\n");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader
        back={{ href: dayHref, label: "Giornata" }}
        title="Revisione guidata"
        description={
          <>
            {date.split("-").reverse().join("/")} · {trades.length} trade da rivedere
          </>
        }
      />

      <ReviewWizard
        date={date}
        dayHref={dayHref}
        trades={trades.map((trade) => ({
          id: trade.id,
          symbol: trade.symbol,
          direction: trade.direction,
          netPnl: trade.netPnl.toString(),
          rMultiple: trade.rMultiple?.toString() ?? null,
          currency: trade.account.currency,
          strategyId: trade.strategyId ?? "",
          rating: trade.rating,
          tags: trade.tags.map(({ tag }) => ({
            name: tag.name,
            category: tag.category,
          })),
        }))}
        strategies={strategies}
        tagSuggestions={tags.map((t) => ({ name: t.name, category: t.category }))}
        postmarketInitial={postmarket?.content ?? statsTemplate}
      />
    </div>
  );
}
