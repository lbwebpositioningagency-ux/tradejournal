"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { zonedInputToUtc } from "@/lib/dates";
import { computeTrade, TradeComputeError } from "@/lib/trade-compute";
import { DEMO_READONLY_MESSAGE } from "@/lib/constants";
import {
  tradeInputSchema,
  tradeReviewSchema,
  type TradeInput,
  type TradeReviewInput,
} from "@/lib/validations/trade";

export type TradeActionResult =
  { error: string } | { success: true; tradeId: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Valida l'input, verifica la proprietà delle risorse collegate e restituisce
 * i dati pronti per la scrittura (campi denormalizzati calcolati inclusi).
 */
async function prepareTradeData(userId: string, input: TradeInput) {
  const parsed = tradeInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    } as const;
  }
  const data = parsed.data;

  const account = await prisma.tradingAccount.findFirst({
    where: { id: data.tradingAccountId, userId },
    select: { id: true, isDemo: true },
  });
  if (!account) return { error: "Conto non trovato" } as const;
  // Il conto demo globale appartiene a un utente di sistema, quindi il filtro
  // per userId qui sopra lo esclude già. Guardia esplicita comunque: rende
  // l'invariante "SIM1 è in sola lettura" dichiarata e testabile.
  if (account.isDemo) return { error: DEMO_READONLY_MESSAGE } as const;

  if (data.strategyId) {
    const strategy = await prisma.strategy.findFirst({
      where: { id: data.strategyId, userId },
      select: { id: true },
    });
    if (!strategy) return { error: "Strategia non trovata" } as const;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  const executions = data.executions.map((execution) => ({
    side: execution.side,
    quantity: execution.quantity,
    price: execution.price,
    fee: execution.fee,
    executedAt: zonedInputToUtc(execution.executedAt, user.timezone),
  }));

  let computed;
  try {
    computed = computeTrade(executions, {
      pointValue: data.pointValue,
      initialRisk: data.initialRisk ?? null,
      plannedStop: data.plannedStop ?? null,
      plannedTarget: data.plannedTarget ?? null,
    });
  } catch (error) {
    if (error instanceof TradeComputeError)
      return { error: error.message } as const;
    throw error;
  }

  return { data, executions, computed } as const;
}

/** Upsert dei tag per nome e ritorno degli id (sempre dell'utente). */
async function resolveTagIds(
  userId: string,
  names: string[],
): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const ids: string[] = [];
  for (const name of unique) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

export async function createTradeAction(
  input: TradeInput,
): Promise<TradeActionResult> {
  const userId = await requireUserId();
  const prepared = await prepareTradeData(userId, input);
  if (prepared.error !== undefined) return { error: prepared.error };
  const { data, executions, computed } = prepared;

  const tagIds = await resolveTagIds(userId, data.tags);

  const trade = await prisma.trade.create({
    data: {
      tradingAccountId: data.tradingAccountId,
      symbol: data.symbol,
      assetClass: data.assetClass,
      direction: computed.direction,
      status: computed.status,
      openedAt: computed.openedAt,
      closedAt: computed.closedAt,
      pointValue: data.pointValue,
      quantity: computed.quantity,
      avgEntryPrice: computed.avgEntryPrice,
      avgExitPrice: computed.avgExitPrice,
      grossPnl: computed.grossPnl,
      fees: computed.fees,
      netPnl: computed.netPnl,
      initialRisk: data.initialRisk ?? null,
      plannedStop: data.plannedStop ?? null,
      plannedTarget: data.plannedTarget ?? null,
      rMultiple: computed.rMultiple,
      targetR: computed.targetR,
      strategyId: data.strategyId ?? null,
      rating: data.rating ?? null,
      executions: { create: executions },
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      ...(data.notes
        ? {
            notes: {
              create: { userId, type: "TRADE" as const, content: data.notes },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  revalidatePath("/trades");
  return { success: true, tradeId: trade.id };
}

export async function updateTradeAction(
  tradeId: string,
  input: TradeInput,
): Promise<TradeActionResult> {
  const userId = await requireUserId();

  const existing = await prisma.trade.findFirst({
    where: { id: tradeId, account: { userId, isDemo: false } },
    select: { id: true },
  });
  if (!existing) return { error: "Trade non trovato" };

  const prepared = await prepareTradeData(userId, input);
  if (prepared.error !== undefined) return { error: prepared.error };
  const { data, executions, computed } = prepared;

  const tagIds = await resolveTagIds(userId, data.tags);

  await prisma.$transaction(async (tx) => {
    await tx.execution.deleteMany({ where: { tradeId } });
    await tx.tradeTag.deleteMany({ where: { tradeId } });

    /* B-06 — il form ha UN campo note ma il modello ne ammette N per trade
       (la revisione guidata ne aggiunge una seconda). Il form mostra il merge
       "\n\n" delle note esistenti (stesso ordine createdAt di edit/page.tsx):
       se il valore inviato coincide con quel merge, le note NON vengono
       toccate — struttura e date sopravvivono a un salvataggio che non le
       riguardava. Solo un testo davvero modificato le sostituisce (fuse in
       una, com'è sempre stato per il campo unico). */
    const currentNotes = await tx.note.findMany({
      where: { tradeId, type: "TRADE" },
      orderBy: { createdAt: "asc" },
      select: { content: true },
    });
    const mergedNotes = currentNotes.map((note) => note.content).join("\n\n");
    const notesUnchanged = (data.notes ?? "") === mergedNotes;
    if (!notesUnchanged) {
      await tx.note.deleteMany({ where: { tradeId, type: "TRADE" } });
    }

    await tx.trade.update({
      where: { id: tradeId },
      data: {
        tradingAccountId: data.tradingAccountId,
        symbol: data.symbol,
        assetClass: data.assetClass,
        direction: computed.direction,
        status: computed.status,
        openedAt: computed.openedAt,
        closedAt: computed.closedAt,
        pointValue: data.pointValue,
        quantity: computed.quantity,
        avgEntryPrice: computed.avgEntryPrice,
        avgExitPrice: computed.avgExitPrice,
        grossPnl: computed.grossPnl,
        fees: computed.fees,
        netPnl: computed.netPnl,
        initialRisk: data.initialRisk ?? null,
        plannedStop: data.plannedStop ?? null,
        plannedTarget: data.plannedTarget ?? null,
        rMultiple: computed.rMultiple,
        targetR: computed.targetR,
        strategyId: data.strategyId ?? null,
        rating: data.rating ?? null,
        executions: { create: executions },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        ...(data.notes && !notesUnchanged
          ? {
              notes: {
                create: { userId, type: "TRADE" as const, content: data.notes },
              },
            }
          : {}),
      },
    });
  });

  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
  return { success: true, tradeId };
}

export async function deleteTradeAction(
  tradeId: string,
): Promise<{ error?: string; success?: boolean }> {
  const userId = await requireUserId();

  const result = await prisma.trade.deleteMany({
    where: { id: tradeId, account: { userId, isDemo: false } },
  });
  if (result.count === 0) return { error: "Trade non trovato" };

  revalidatePath("/trades");
  return { success: true };
}

/**
 * W5 — revisione guidata: aggiorna SOLO strategia, valutazione e tag del
 * trade e aggiunge un'eventuale nota. Le esecuzioni e i numeri non si
 * toccano: è journaling, non editing.
 */
export async function reviewTradeAction(
  tradeId: string,
  input: TradeReviewInput,
): Promise<{ error?: string; success?: boolean }> {
  const userId = await requireUserId();

  const parsed = tradeReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const data = parsed.data;

  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, account: { userId, isDemo: false } },
    select: { id: true },
  });
  if (!trade) return { error: "Trade non trovato" };

  if (data.strategyId) {
    const strategy = await prisma.strategy.findFirst({
      where: { id: data.strategyId, userId },
      select: { id: true },
    });
    if (!strategy) return { error: "Strategia non trovata" };
  }

  const tagIds = await resolveTagIds(userId, data.tags);

  await prisma.$transaction(async (tx) => {
    await tx.trade.update({
      where: { id: tradeId },
      data: {
        strategyId: data.strategyId || null,
        rating: data.rating,
      },
    });
    await tx.tradeTag.deleteMany({ where: { tradeId } });
    if (tagIds.length > 0) {
      await tx.tradeTag.createMany({
        data: tagIds.map((tagId) => ({ tradeId, tagId })),
      });
    }
    if (data.note) {
      await tx.note.create({
        data: { userId, type: "TRADE", tradeId, content: data.note },
      });
    }
  });

  revalidatePath(`/trades/${tradeId}`);
  return { success: true };
}
