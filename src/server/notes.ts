"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayNoteSchema, type DayNoteInput } from "@/lib/validations/note";

export type DayNoteActionResult = {
  error?: string;
  success?: boolean;
  deleted?: boolean;
};

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Salva (upsert) UNA fase del journal di giornata (Premarket / In-Market /
 * Post-Market); contenuto vuoto = elimina solo quella fase. Stesso pattern
 * della nota singola originale, esteso con `dayPhase`.
 * `dayDate` è una colonna @db.Date: il giorno di calendario nel fuso utente,
 * salvato come mezzanotte UTC di quella data (solo chiave, non istante).
 */
export async function saveDayNoteAction(
  input: DayNoteInput,
): Promise<DayNoteActionResult> {
  const userId = await requireUserId();

  const parsed = dayNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const { date, phase, content } = parsed.data;
  const dayDate = new Date(`${date}T00:00:00.000Z`);

  if (content === "") {
    // In-Market copre anche eventuali note legacy senza fase
    // (pre-migrazione), coerente col fallback di lettura.
    const phaseWhere = {
      userId,
      type: "DAILY" as const,
      dayDate,
      OR: [
        { dayPhase: phase },
        ...(phase === "INMARKET" ? [{ dayPhase: null as null }] : []),
      ],
    };
    // Fase 24: la nota di fase è anche il contenitore degli ALLEGATI della
    // fase (Attachment.noteId, cascade). Svuotare il testo non deve
    // eliminarli in silenzio: se ci sono allegati la riga resta, vuota.
    const withAttachments = await prisma.note.findFirst({
      where: { ...phaseWhere, attachments: { some: {} } },
      select: { id: true },
    });
    if (withAttachments) {
      await prisma.note.update({
        where: { id: withAttachments.id },
        data: { content: "" },
      });
    }
    await prisma.note.deleteMany({
      where: withAttachments
        ? { ...phaseWhere, id: { not: withAttachments.id } }
        : phaseWhere,
    });
    revalidatePath(`/day/${date}`);
    revalidatePath("/day");
    return { success: true, deleted: !withAttachments };
  }

  await prisma.note.upsert({
    where: { userId_dayDate_dayPhase: { userId, dayDate, dayPhase: phase } },
    update: { content },
    create: { userId, type: "DAILY", dayDate, dayPhase: phase, content },
  });

  revalidatePath(`/day/${date}`);
  revalidatePath("/day");
  return { success: true };
}
