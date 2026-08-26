import { z } from "zod";
import { CURRENCIES } from "@/lib/constants";

// Ri-esportata per non rompere gli import server esistenti; la fonte è
// `lib/constants.ts`, che non porta zod nel bundle client (P-02).
export { CURRENCIES };

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
});

export type TradingAccountInput = z.infer<typeof tradingAccountSchema>;
