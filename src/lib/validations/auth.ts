import { z } from "zod";
import { CURRENCIES } from "./account";

export const loginSchema = z.object({
  email: z.email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome troppo corto").max(60, "Nome troppo lungo"),
  email: z.email("Email non valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(72),
  // F15 — saldo iniziale chiesto già in registrazione: crea il primo conto con
  // il saldo giusto, così le metriche % e il tracker prop partono corretti.
  currency: z.enum(CURRENCIES),
  initialBalance: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, "Saldo non valido (max 2 decimali)")
    .transform((v) => v.replace(",", ".")),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
