import { z } from "zod";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_NOTEBOOK_CONTENT,
  MAX_NOTEBOOK_TITLE,
  NOTEBOOK_IMAGE_TYPES,
} from "@/lib/constants";

/**
 * Salvataggio di una nota del Notebook. Senza `id` la nota nasce: la data di
 * creazione la mette il server, e non esiste un campo per sceglierla.
 */
export const notebookNoteSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z
    .string()
    .max(MAX_NOTEBOOK_TITLE, `Titolo troppo lungo (max ${MAX_NOTEBOOK_TITLE} caratteri)`),
  content: z
    .string()
    .max(MAX_NOTEBOOK_CONTENT, "Nota troppo lunga (max 100.000 caratteri)"),
});

export type NotebookNoteInput = z.input<typeof notebookNoteSchema>;

export const notebookImageFileSchema = z.object({
  fileName: z.string().trim().min(1, "Nome file mancante").max(200, "Nome file troppo lungo"),
  mimeType: z.enum(NOTEBOOK_IMAGE_TYPES, {
    message: "Formato non supportato: sono ammessi PNG, JPG, WEBP e GIF",
  }),
  size: z
    .number()
    .int()
    .positive("File vuoto")
    .max(MAX_ATTACHMENT_BYTES, "Immagine troppo grande (max 4 MB)"),
});
