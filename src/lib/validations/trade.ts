import { z } from "zod";
import { hasValidCalendarDate } from "@/lib/dates";
import { ASSET_CLASSES } from "@/lib/constants";

/**
 * Gli importi arrivano dai form come stringhe e RESTANO stringhe fino a
 * Prisma/Decimal (mai Number JS). La virgola è accettata come separatore
 * decimale e normalizzata a punto.
 */
function decimalString(maxScale: number, message: string) {
  const re = new RegExp(`^\\d+([.,]\\d{1,${maxScale}})?$`);
  return z
    .string()
    .trim()
    .regex(re, message)
    .transform((v) => v.replace(",", "."));
}

const priceString = decimalString(8, "Prezzo non valido (max 8 decimali)");
const qtyString = decimalString(8, "Quantità non valida (max 8 decimali)");
const moneyString = decimalString(2, "Importo non valido (max 2 decimali)");

const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export const executionInputSchema = z.object({
  side: z.enum(["BUY", "SELL"]),
  quantity: qtyString,
  price: priceString,
  fee: moneyString.optional().default("0"),
  /** datetime-local nel fuso dell'utente; convertito in UTC lato server. */
  executedAt: z
    .string()
    .regex(DATETIME_LOCAL_RE, "Data/ora esecuzione non valida")
    .refine(hasValidCalendarDate, "Data esecuzione inesistente (controlla giorno e mese)"),
});

export const tradeInputSchema = z.object({
  tradingAccountId: z.string().min(1, "Seleziona un conto"),
  symbol: z
    .string()
    .trim()
    .min(1, "Simbolo obbligatorio")
    .max(20, "Simbolo troppo lungo")
    .transform((v) => v.toUpperCase()),
  assetClass: z.enum(ASSET_CLASSES),
  pointValue: priceString.optional().default("1"),
  initialRisk: moneyString.optional().or(z.literal("").transform(() => undefined)),
  plannedStop: priceString.optional().or(z.literal("").transform(() => undefined)),
  plannedTarget: priceString.optional().or(z.literal("").transform(() => undefined)),
  strategyId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(5000, "Nota troppo lunga").optional(),
  tags: z
    .array(z.string().trim().min(1).max(30, "Tag troppo lungo"))
    .max(10, "Massimo 10 tag")
    .default([]),
  executions: z
    .array(executionInputSchema)
    .min(1, "Aggiungi almeno una esecuzione")
    .max(50, "Massimo 50 esecuzioni"),
});

export type TradeInput = z.input<typeof tradeInputSchema>;
export type ParsedTradeInput = z.output<typeof tradeInputSchema>;

/**
 * W5 — revisione guidata di fine giornata: patch leggera per trade
 * (strategia, valutazione, tag, una riga di nota), MAI le esecuzioni.
 */
export const tradeReviewSchema = z.object({
  strategyId: z.string().optional(),
  rating: z.number().int().min(1).max(5).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  note: z.string().trim().max(2000).optional(),
});

export type TradeReviewInput = z.infer<typeof tradeReviewSchema>;
