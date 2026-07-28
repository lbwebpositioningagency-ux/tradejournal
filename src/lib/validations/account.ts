import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"] as const;

/**
 * F36 — importo regola prop: stringa decimale POSITIVA (Decimal-safe, mai
 * Number nei calcoli), vuota = regola non attiva (null: su update azzera).
 */
const propAmount = z
  .literal("")
  .transform(() => null)
  .or(
    z
      .string()
      .trim()
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo non valido (max 2 decimali)")
      .refine((v) => !/^0+([.,]0{1,2})?$/.test(v), "L'importo deve essere positivo")
      .transform((v) => v.replace(",", ".")),
  );

export const tradingAccountSchema = z.object({
  name: z.string().trim().min(1, "Nome obbligatorio").max(60, "Nome troppo lungo"),
  broker: z
    .string()
    .trim()
    .max(60, "Nome broker troppo lungo")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  currency: z.enum(CURRENCIES),
  // Il saldo arriva come stringa dal form e resta stringa fino a Prisma (Decimal-safe).
  initialBalance: z
    .string()
    .trim()
    .regex(/^-?\d+([.,]\d{1,2})?$/, "Importo non valido (max 2 decimali)")
    .transform((v) => v.replace(",", ".")),
  // F36 — regole prop firm, tutte opzionali.
  propDailyLossLimit: propAmount,
  propMaxDrawdown: propAmount,
  propDrawdownType: z.enum(["STATIC", "TRAILING"]),
  propProfitTarget: propAmount,
  propMinTradingDays: z
    .literal("")
    .transform(() => null)
    .or(
      z
        .string()
        .trim()
        .regex(/^\d+$/, "Numero di giornate non valido")
        .transform(Number)
        .refine((n) => n >= 1 && n <= 365, "Giornate tra 1 e 365"),
    ),
});

export type TradingAccountInput = z.infer<typeof tradingAccountSchema>;
