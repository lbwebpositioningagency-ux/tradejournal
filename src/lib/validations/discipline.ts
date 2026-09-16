import Decimal from "decimal.js";
import { z } from "zod";
import {
  DISCIPLINE_RULE_TYPES,
  RULE_CATALOG,
  RULE_SESSIONS,
} from "@/lib/discipline/catalog";

/**
 * Configurazione di UNA regola di disciplina. I valori in denaro, in R e le
 * quantità viaggiano come stringhe decimali fino a Prisma (mai Number JS); la
 * virgola è accettata come separatore decimale.
 */
function decimalString(maxScale: number, message: string) {
  return z
    .string()
    .trim()
    .regex(new RegExp(`^\\d+([.,]\\d{1,${maxScale}})?$`), message)
    .transform((v) => v.replace(",", "."));
}

const positive = (message: string) => (v: string) => new Decimal(v).gt(0) || message;

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Valuta non valida (codice di 3 lettere, es. USD)");

const symbolCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "Simbolo obbligatorio")
  .max(40, "Simbolo troppo lungo");

export const disciplineRuleSchema = z
  .object({
    type: z.enum(DISCIPLINE_RULE_TYPES),
    isActive: z.boolean(),
    rValue: decimalString(4, "Valore in R non valido (max 4 decimali)").nullable(),
    countValue: z.number().int("Serve un numero intero").min(1, "Almeno 1").max(1000).nullable(),
    minutesValue: z.number().int("Serve un numero intero").min(1, "Almeno 1 minuto").max(24 * 60).nullable(),
    sessions: z.array(z.enum(RULE_SESSIONS)).max(RULE_SESSIONS.length),
    allowWeekend: z.boolean(),
    currencyLimits: z
      .array(
        z.object({
          currency: currencyCode,
          amount: decimalString(2, "Importo non valido (max 2 decimali)").refine(
            (v) => new Decimal(v).gt(0) && new Decimal(v).lt("1e12"),
            "L'importo deve essere maggiore di zero",
          ),
        }),
      )
      .max(20),
    symbolLimits: z
      .array(
        z.object({
          symbol: symbolCode,
          quantity: decimalString(8, "Quantità non valida (max 8 decimali)").refine(
            (v) => new Decimal(v).gt(0) && new Decimal(v).lt("1e10"),
            "La quantità deve essere maggiore di zero",
          ),
        }),
      )
      .max(100),
  })
  .superRefine((rule, ctx) => {
    const kind = RULE_CATALOG[rule.type].paramKind;
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });

    if (kind === "r") {
      if (rule.rValue === null) fail("Serve un valore in R", "rValue");
      // La tolleranza può essere zero; l'R/R minimo no.
      else if (rule.type === "MIN_TARGET_R") {
        const check = positive("L'R/R minimo deve essere maggiore di zero")(rule.rValue);
        if (check !== true) fail(check, "rValue");
      }
    }
    if (kind === "count" && rule.countValue === null) fail("Serve un numero", "countValue");
    if (kind === "minutes" && rule.minutesValue === null) fail("Servono i minuti", "minutesValue");
    if (kind === "sessions" && rule.sessions.length === 0) {
      fail("Scegli almeno una sessione", "sessions");
    }
    const currencies = rule.currencyLimits.map((l) => l.currency);
    if (new Set(currencies).size !== currencies.length) {
      fail("Una sola soglia per valuta", "currencyLimits");
    }
    const symbols = rule.symbolLimits.map((l) => l.symbol);
    if (new Set(symbols).size !== symbols.length) {
      fail("Una sola soglia per simbolo", "symbolLimits");
    }
  })
  // Si salvano solo i parametri che il tipo usa: gli altri tornano neutri,
  // così una riga non porta mai un valore che nessuno legge.
  .transform((rule) => {
    const kind = RULE_CATALOG[rule.type].paramKind;
    return {
      ...rule,
      rValue: kind === "r" ? rule.rValue : null,
      countValue: kind === "count" ? rule.countValue : null,
      minutesValue: kind === "minutes" ? rule.minutesValue : null,
      sessions: kind === "sessions" ? rule.sessions : [],
      allowWeekend: kind === "sessions" ? rule.allowWeekend : false,
      currencyLimits: kind === "currency" ? rule.currencyLimits : [],
      symbolLimits: kind === "symbol" ? rule.symbolLimits : [],
    };
  });

export type DisciplineRuleInput = z.input<typeof disciplineRuleSchema>;
export type DisciplineRuleData = z.output<typeof disciplineRuleSchema>;
