import { z } from "zod";

export const strategySchema = z.object({
  name: z.string().trim().min(1, "Nome obbligatorio").max(60, "Nome troppo lungo"),
  description: z
    .string()
    .trim()
    .max(500, "Descrizione troppo lunga")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type StrategyInput = z.infer<typeof strategySchema>;
