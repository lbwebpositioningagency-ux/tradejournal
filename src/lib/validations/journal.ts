import { z } from "zod";

/**
 * F3 — schemi del flusso di journaling per trade: piano, revisione
 * strutturata e checklist pre-trade.
 */

/** Testo di una risposta della revisione: corto per costruzione. */
const answer = z
  .string()
  .trim()
  .max(1000, "Risposta troppo lunga")
  // Il trim viene PRIMA: "   " è una risposta vuota, e deve diventare
  // undefined come "". Con `.or(z.literal(""))` il primo ramo avrebbe già
  // accettato la stringa vuota e a database sarebbe finita una risposta
  // vuota indistinguibile da una data.
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const tradeReviewFormSchema = z.object({
  tradeId: z.string().min(1),
  /**
   * null = «non ancora risposto», e non è la stessa cosa di «no». È l'unico
   * campo aggregabile della revisione: confonderlo con un no falserebbe la
   * riga «win rate quando ho seguito il piano».
   */
  followedPlan: z.boolean().nullable(),
  whatWorked: answer,
  whatFailed: answer,
  nextTime: answer,
});

export type TradeReviewFormInput = z.infer<typeof tradeReviewFormSchema>;

/** Nota di un trade, distinta per momento in cui è stata scritta. */
export const tradeNoteSchema = z.object({
  tradeId: z.string().min(1),
  phase: z.enum(["PLAN", "REVIEW"]),
  content: z.string().trim().max(5000, "Nota troppo lunga"),
});

export type TradeNoteInput = z.infer<typeof tradeNoteSchema>;

/**
 * Voci della checklist: si salvano tutte insieme, in ordine.
 *
 * Salvataggio dell'INTERA lista e non della singola voce: l'ordine è parte
 * del contenuto — una checklist è una sequenza — e riordinare con `n`
 * chiamate lascerebbe stati intermedi visibili.
 */
export const checklistTemplateSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().trim().min(1, "Voce vuota").max(120, "Voce troppo lunga"),
      }),
    )
    .max(20, "Massimo 20 voci: una checklist che non si legge non si usa"),
});

export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

/** Spunte di un singolo trade. */
export const tradeChecklistSchema = z.object({
  tradeId: z.string().min(1),
  checks: z
    .array(z.object({ itemId: z.string().min(1), checked: z.boolean() }))
    .max(20),
});

export type TradeChecklistInput = z.infer<typeof tradeChecklistSchema>;
