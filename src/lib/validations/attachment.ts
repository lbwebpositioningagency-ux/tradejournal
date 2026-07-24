import { z } from "zod";
import { isValidDateKey } from "@/lib/calendar";

/**
 * Vincoli upload allegati (F16b).
 *
 * I byte vivono in Postgres (vedi schema, campo `data`): il limite per file
 * resta prudente sia per il body delle server action (bodySizeLimit in
 * next.config.ts) sia per il limite request di Vercel (~4,5 MB).
 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_ATTACHMENTS_PER_TARGET = 12;

/** MIME ammessi: screenshot e documenti di analisi, niente eseguibili. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** Metadati del file (il contenuto arriva via FormData, validato a parte). */
export const attachmentFileSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Nome file mancante")
    .max(200, "Nome file troppo lungo (max 200 caratteri)"),
  mimeType: z
    .string()
    .refine((t) => t in ALLOWED_ATTACHMENT_TYPES, {
      message: "Formato non supportato: sono ammessi PNG, JPG, WEBP, GIF e PDF",
    }),
  size: z
    .number()
    .int()
    .positive("File vuoto")
    .max(MAX_ATTACHMENT_BYTES, "File troppo grande (max 4 MB)"),
});

/**
 * Destinazione dell'allegato: un trade (per id) OPPURE una giornata
 * (chiave "YYYY-MM-DD" nel fuso utente), mai entrambi.
 */
export const attachmentTargetSchema = z.union([
  z.object({ kind: z.literal("trade"), tradeId: z.string().min(1) }),
  z.object({
    kind: z.literal("day"),
    date: z.string().refine(isValidDateKey, {
      message: "Data non valida",
    }),
  }),
]);

export type AttachmentTarget = z.infer<typeof attachmentTargetSchema>;
