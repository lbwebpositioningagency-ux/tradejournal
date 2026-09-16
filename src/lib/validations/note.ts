import { z } from "zod";
import { isValidDateKey, weekStartOf } from "@/lib/calendar";
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

/**
 * Journal di settimana (Note type=WEEKLY): UNA nota per settimana per
 * utente, senza fasi. La chiave è il lunedì nel fuso dell'utente: un altro
 * giorno viene rifiutato invece che normalizzato, perché un indirizzo che
 * salva su una settimana diversa da quella mostrata sarebbe un errore
 * silenzioso.
 */
export const weekNoteSchema = z.object({
  /** Lunedì della settimana ("YYYY-MM-DD"). */
  week: z
    .string()
    .refine(isValidDateKey, "Data non valida")
    .refine((v) => weekStartOf(v) === v, "La settimana si indica col suo lunedì"),
  /** Contenuto markdown; vuoto = elimina la nota (se non ha allegati). */
  content: z.string().trim().max(10000, "Nota troppo lunga (max 10.000 caratteri)"),
});

export type WeekNoteInput = z.input<typeof weekNoteSchema>;
