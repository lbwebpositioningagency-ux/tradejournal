"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sniffMimeType } from "@/lib/file-signature";
import { MAX_NOTEBOOK_IMAGES_PER_NOTE } from "@/lib/constants";
import {
  notebookImageFileSchema,
  notebookNoteSchema,
  type NotebookNoteInput,
} from "@/lib/validations/notebook";

export type NotebookSaveResult =
  | { error: string }
  | { id: string; createdAt: string; updatedAt: string };

export type NotebookActionResult = { error?: string; success?: boolean };

export type NotebookImageResult = { error: string } | { id: string; url: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Salvataggio automatico di una nota del Notebook.
 * Senza `id` crea la nota: `createdAt` lo assegna il database in quel momento
 * ed è la data di riferimento della nota. Con `id` aggiorna titolo e testo e
 * nient'altro — la data di creazione non passa mai da qui.
 */
export async function saveNotebookNoteAction(
  input: NotebookNoteInput,
): Promise<NotebookSaveResult> {
  const userId = await requireUserId();

  const parsed = notebookNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const { id, title, content } = parsed.data;

  if (!id) {
    const note = await prisma.notebookNote.create({
      data: { userId, title, content },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    revalidatePath("/notebook");
    return {
      id: note.id,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  const { count } = await prisma.notebookNote.updateMany({
    where: { id, userId },
    data: { title, content },
  });
  if (count === 0) return { error: "Nota non trovata" };
  const note = await prisma.notebookNote.findFirstOrThrow({
    where: { id, userId },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  revalidatePath("/notebook");
  return {
    id: note.id,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/** Elimina una nota e le sue immagini (cascade). Filtro userId sempre nel where. */
export async function deleteNotebookNoteAction(id: string): Promise<NotebookActionResult> {
  const userId = await requireUserId();
  const { count } = await prisma.notebookNote.deleteMany({ where: { id, userId } });
  if (count === 0) return { error: "Nota non trovata" };
  revalidatePath("/notebook");
  return { success: true };
}

/**
 * Immagine per il testo di una nota già salvata. FormData: `file` + `noteId`.
 * Il tipo vero si legge nei byte, come per gli allegati del journal.
 */
export async function uploadNotebookImageAction(
  formData: FormData,
): Promise<NotebookImageResult> {
  const userId = await requireUserId();

  const file = formData.get("file");
  const noteId = formData.get("noteId");
  if (!(file instanceof File)) return { error: "Nessun file ricevuto" };
  if (typeof noteId !== "string" || noteId === "") return { error: "Nota non valida" };

  const parsedFile = notebookImageFileSchema.safeParse({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  if (!parsedFile.success) {
    return { error: parsedFile.error.issues[0]?.message ?? "File non valido" };
  }

  const note = await prisma.notebookNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!note) return { error: "Nota non trovata" };
  if (note._count.images >= MAX_NOTEBOOK_IMAGES_PER_NOTE) {
    return { error: `Limite raggiunto: massimo ${MAX_NOTEBOOK_IMAGES_PER_NOTE} immagini per nota` };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const checked = notebookImageFileSchema.shape.size.safeParse(data.byteLength);
  if (!checked.success) {
    return { error: checked.error.issues[0]?.message ?? "File non valido" };
  }
  const sniffed = sniffMimeType(data);
  if (sniffed !== parsedFile.data.mimeType) {
    return { error: "Il contenuto del file non è un'immagine PNG, JPG, WEBP o GIF" };
  }

  const image = await prisma.notebookImage.create({
    data: {
      userId,
      noteId: note.id,
      fileName: parsedFile.data.fileName,
      mimeType: sniffed,
      size: data.byteLength,
      data,
    },
    select: { id: true },
  });
  return { id: image.id, url: `/api/notebook/images/${image.id}` };
}
