import { z } from "zod";
import { isValidDateKey } from "@/lib/calendar";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/constants";

/*
 * Vincoli upload allegati (F16b): i valori vivono in lib/constants.ts (P-02,
 * i client li usano senza trascinare zod); qui restano solo gli schemi.
 * I byte vivono in Postgres (vedi schema, campo `data`).
 */

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
 * Destinazione dell'allegato: un trade (per id), una giornata intera
 * (chiave "YYYY-MM-DD" nel fuso utente) oppure UNA FASE del journal di
 * quella giornata (Fase 24) — mai più d'una.
 *
 * La fase non è un campo dell'allegato: è la Note DAILY di giorno+fase a
 * cui l'allegato si aggancia via `noteId`. Il target "day" resta per gli
 * allegati generici di giornata (e per quelli storici, che non vengono
 * riassegnati a una fase: un contesto non registrato non si inventa).
 */
export const attachmentTargetSchema = z.union([
  z.object({ kind: z.literal("trade"), tradeId: z.string().min(1) }),
  z.object({
    kind: z.literal("day"),
    date: z.string().refine(isValidDateKey, {
      message: "Data non valida",
    }),
  }),
  z.object({
    kind: z.literal("phase"),
    date: z.string().refine(isValidDateKey, {
      message: "Data non valida",
    }),
    phase: z.enum(["PREMARKET", "INMARKET", "POSTMARKET"]),
  }),
]);

export type AttachmentTarget = z.infer<typeof attachmentTargetSchema>;
