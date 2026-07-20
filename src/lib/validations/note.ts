import { z } from "zod";
import { isValidDateKey } from "@/lib/calendar";
import { DAY_PHASES } from "@/lib/day-journal";

/**
 * Journal di giornata a 3 fasi (Note type=DAILY): una nota per giorno E fase
 * per utente. Stesso pattern di validazione della nota singola originale,
 * esteso col campo fase.
 */
export const dayNoteSchema = z.object({
  /** Giorno di calendario nel fuso dell'utente ("YYYY-MM-DD"). */
  date: z
    .string()
    .refine(isValidDateKey, "Data non valida"),
  /** Fase del journal: Premarket / In-Market / Post-Market. */
  phase: z.enum(DAY_PHASES),
  /** Contenuto markdown; vuoto = elimina la nota della fase. */
  content: z.string().trim().max(10000, "Nota troppo lunga (max 10.000 caratteri)"),
});

export type DayNoteInput = z.input<typeof dayNoteSchema>;
