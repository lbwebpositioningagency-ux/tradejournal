"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEMO_READONLY_MESSAGE } from "@/lib/constants";
import {
  checklistTemplateSchema,
  tradeChecklistSchema,
  tradeNoteSchema,
  tradeReviewFormSchema,
  type ChecklistTemplateInput,
  type TradeChecklistInput,
  type TradeNoteInput,
  type TradeReviewFormInput,
} from "@/lib/validations/journal";

/**
 * F3 — server action del flusso di journaling per trade.
 *
 * Ogni azione verifica la proprietà del trade PRIMA di scrivere, con lo
 * stesso pattern del resto del progetto (`account: { userId, isDemo: false }`
 * nel where): il conto demo è di un utente di sistema, quindi il filtro lo
 * esclude già, e la guardia esplicita rende l'invariante testabile.
 */

export type JournalActionResult = { error: string } | { success: true };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/** Trade scrivibile dell'utente, o il motivo per cui non lo è. */
type WritableTrade =
  | { ok: true; tradeId: string }
  | { ok: false; error: string };

async function requireWritableTrade(
  userId: string,
  tradeId: string,
): Promise<WritableTrade> {
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, account: { userId } },
    select: { id: true, account: { select: { isDemo: true } } },
  });
  if (!trade) return { ok: false, error: "Trade non trovato" };
  if (trade.account.isDemo) return { ok: false, error: DEMO_READONLY_MESSAGE };
  return { ok: true, tradeId: trade.id };
}

/**
 * Salva il PIANO o la REVISIONE testuale di un trade.
 *
 * Contenuto vuoto = la nota si cancella. Una nota svuotata che resta a
 * database riapparirebbe come riga vuota in ogni vista che le elenca.
 */
export async function saveTradeNoteAction(
  input: TradeNoteInput,
): Promise<JournalActionResult> {
  const userId = await requireUserId();
  const parsed = tradeNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const { tradeId, phase, content } = parsed.data;

  const guard = await requireWritableTrade(userId, tradeId);
  if (!guard.ok) return { error: guard.error };

  if (content === "") {
    await prisma.note.deleteMany({
      where: { tradeId, userId, type: "TRADE", tradePhase: phase },
    });
  } else {
    const existing = await prisma.note.findFirst({
      where: { tradeId, userId, type: "TRADE", tradePhase: phase },
      select: { id: true },
    });
    if (existing) {
      await prisma.note.update({ where: { id: existing.id }, data: { content } });
    } else {
      await prisma.note.create({
        data: { userId, tradeId, type: "TRADE", tradePhase: phase, content },
      });
    }
  }

  revalidatePath(`/trades/${tradeId}`);
  return { success: true };
}

/** Salva la revisione strutturata (tre domande + «ho seguito il piano?»). */
export async function saveTradeReviewAction(
  input: TradeReviewFormInput,
): Promise<JournalActionResult> {
  const userId = await requireUserId();
  const parsed = tradeReviewFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const { tradeId, followedPlan, whatWorked, whatFailed, nextTime } = parsed.data;

  const guard = await requireWritableTrade(userId, tradeId);
  if (!guard.ok) return { error: guard.error };

  const data = {
    followedPlan,
    whatWorked: whatWorked ?? null,
    whatFailed: whatFailed ?? null,
    nextTime: nextTime ?? null,
  };
  // Revisione interamente vuota = revisione cancellata: una riga di soli
  // null è indistinguibile da "non l'ho ancora fatta", e tenerla farebbe
  // contare come riviste delle operazioni che nessuno ha guardato.
  const empty =
    followedPlan === null &&
    data.whatWorked === null &&
    data.whatFailed === null &&
    data.nextTime === null;

  if (empty) {
    await prisma.tradeReview.deleteMany({ where: { tradeId } });
  } else {
    await prisma.tradeReview.upsert({
      where: { tradeId },
      update: data,
      create: { tradeId, ...data },
    });
  }

  revalidatePath(`/trades/${tradeId}`);
  return { success: true };
}

/**
 * Salva l'INTERO modello di checklist dell'utente.
 *
 * Le voci sparite dall'elenco vengono ARCHIVIATE, non cancellate: le spunte
 * dei trade passati le referenziano, e cancellarle porterebbe via con sé la
 * prova di ciò che era stato verificato. Una voce riproposta con la stessa
 * etichetta torna attiva invece di duplicarsi.
 */
export async function saveChecklistTemplateAction(
  input: ChecklistTemplateInput,
): Promise<JournalActionResult> {
  const userId = await requireUserId();
  const parsed = checklistTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const labels = parsed.data.items.map((i) => i.label);
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
    return { error: "Due voci hanno la stessa etichetta" };
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.checklistItem.findMany({
      where: { userId },
      select: { id: true, label: true },
    });
    const byLabel = new Map(existing.map((i) => [i.label, i.id]));
    const keep = new Set<string>();

    for (const [position, item] of parsed.data.items.entries()) {
      const id = byLabel.get(item.label);
      if (id) {
        await tx.checklistItem.update({
          where: { id },
          data: { position, isArchived: false },
        });
        keep.add(id);
      } else {
        const created = await tx.checklistItem.create({
          data: { userId, label: item.label, position },
          select: { id: true },
        });
        keep.add(created.id);
      }
    }

    await tx.checklistItem.updateMany({
      where: { userId, id: { notIn: [...keep] } },
      data: { isArchived: true },
    });
  });

  revalidatePath("/settings");
  revalidatePath("/trades/new");
  return { success: true };
}

/** Salva le spunte di un trade, con l'etichetta congelata al momento. */
export async function saveTradeChecklistAction(
  input: TradeChecklistInput,
): Promise<JournalActionResult> {
  const userId = await requireUserId();
  const parsed = tradeChecklistSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const { tradeId, checks } = parsed.data;

  const guard = await requireWritableTrade(userId, tradeId);
  if (!guard.ok) return { error: guard.error };

  // Solo voci dell'utente: un itemId altrui non deve poter entrare.
  const items = await prisma.checklistItem.findMany({
    where: { userId, id: { in: checks.map((c) => c.itemId) } },
    select: { id: true, label: true },
  });
  const byId = new Map(items.map((i) => [i.id, i.label]));

  await prisma.$transaction(async (tx) => {
    await tx.tradeChecklistCheck.deleteMany({ where: { tradeId } });
    const rows = checks
      .filter((c) => byId.has(c.itemId))
      .map((c) => ({
        tradeId,
        itemId: c.itemId,
        checked: c.checked,
        label: byId.get(c.itemId)!,
      }));
    if (rows.length > 0) {
      await tx.tradeChecklistCheck.createMany({ data: rows });
    }
  });

  revalidatePath(`/trades/${tradeId}`);
  return { success: true };
}
