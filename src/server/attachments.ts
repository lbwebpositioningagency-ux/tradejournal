"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  attachmentFileSchema,
  attachmentTargetSchema,
  MAX_ATTACHMENTS_PER_TARGET,
} from "@/lib/validations/attachment";

export type AttachmentActionResult = { error?: string; success?: boolean };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/** Path da rigenerare dopo una scrittura, per destinazione. */
function targetPath(
  tradeId: string | null,
  dayDate: Date | null,
): string | null {
  if (tradeId) return `/trades/${tradeId}`;
  if (dayDate) return `/day/${dayDate.toISOString().slice(0, 10)}`;
  return null;
}

/**
 * Upload di un allegato (F16b, esteso in Fase 24) per un trade, per una
 * giornata (Day View) o per una FASE del journal di giornata.
 * FormData: `file` + `kind` ("trade"|"day"|"phase") + `tradeId` o `date`
 * (+ `phase` per kind=phase).
 * I byte finiscono in Postgres (colonna `data`): nessuno storage esterno.
 */
export async function uploadAttachmentAction(
  formData: FormData,
): Promise<AttachmentActionResult> {
  const userId = await requireUserId();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Nessun file ricevuto" };

  const parsedFile = attachmentFileSchema.safeParse({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  if (!parsedFile.success) {
    return { error: parsedFile.error.issues[0]?.message ?? "File non valido" };
  }

  const parsedTarget = attachmentTargetSchema.safeParse({
    kind: formData.get("kind"),
    tradeId: formData.get("tradeId") ?? undefined,
    date: formData.get("date") ?? undefined,
    phase: formData.get("phase") ?? undefined,
  });
  if (!parsedTarget.success) return { error: "Destinazione non valida" };
  const target = parsedTarget.data;

  let tradeId: string | null = null;
  let dayDate: Date | null = null;
  let noteId: string | null = null;
  /** Path da rigenerare (per kind=phase non deriva da tradeId/dayDate). */
  let revalidate: string | null = null;
  if (target.kind === "trade") {
    const trade = await prisma.trade.findFirst({
      where: { id: target.tradeId, account: { userId, isDemo: false } },
      select: { id: true },
    });
    if (!trade) return { error: "Trade non trovato" };
    tradeId = trade.id;
  } else if (target.kind === "day") {
    // Chiave giorno nel fuso utente, salvata come mezzanotte UTC (@db.Date).
    dayDate = new Date(`${target.date}T00:00:00.000Z`);
  } else {
    // FASE del journal: l'allegato si aggancia alla Note DAILY di
    // giorno+fase. Se non esiste ancora (si allega il grafico prima di
    // scrivere il testo) la si crea vuota: è il contenitore della fase,
    // non un testo fantasma — l'editor la mostra semplicemente vuota.
    const noteDay = new Date(`${target.date}T00:00:00.000Z`);
    const note = await prisma.note.upsert({
      where: {
        userId_dayDate_dayPhase: {
          userId,
          dayDate: noteDay,
          dayPhase: target.phase,
        },
      },
      update: {},
      create: {
        userId,
        type: "DAILY",
        dayDate: noteDay,
        dayPhase: target.phase,
        content: "",
      },
      select: { id: true },
    });
    noteId = note.id;
    revalidate = `/day/${target.date}`;
  }

  const existing = await prisma.attachment.count({
    where: tradeId
      ? { userId, tradeId }
      : noteId
        ? { userId, noteId }
        : { userId, dayDate },
  });
  if (existing >= MAX_ATTACHMENTS_PER_TARGET) {
    return {
      error: `Limite raggiunto: massimo ${MAX_ATTACHMENTS_PER_TARGET} allegati`,
    };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  // Il size dichiarato dal client non è affidabile: vale ciò che è arrivato.
  const checked = attachmentFileSchema.shape.size.safeParse(data.byteLength);
  if (!checked.success) {
    return { error: checked.error.issues[0]?.message ?? "File non valido" };
  }

  await prisma.attachment.create({
    data: {
      userId,
      tradeId,
      noteId,
      dayDate,
      fileName: parsedFile.data.fileName,
      filePath: "db", // locator: byte nella colonna `data`
      mimeType: parsedFile.data.mimeType,
      size: data.byteLength,
      data,
    },
  });

  const path = revalidate ?? targetPath(tradeId, dayDate);
  if (path) revalidatePath(path);
  return { success: true };
}

/** Elimina un allegato dell'utente (filtro userId sempre nel where). */
export async function deleteAttachmentAction(
  id: string,
): Promise<AttachmentActionResult> {
  const userId = await requireUserId();

  const attachment = await prisma.attachment.findFirst({
    where: { id, userId },
    select: {
      tradeId: true,
      dayDate: true,
      note: { select: { dayDate: true } },
    },
  });
  if (!attachment) return { error: "Allegato non trovato" };

  await prisma.attachment.deleteMany({ where: { id, userId } });

  // Un allegato di fase non ha dayDate proprio: il giorno sta sulla nota.
  const path = targetPath(
    attachment.tradeId,
    attachment.dayDate ?? attachment.note?.dayDate ?? null,
  );
  if (path) revalidatePath(path);
  return { success: true };
}
