import { z } from "zod";
import { CURRENCIES } from "./account";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("it-IT", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Nome troppo corto").max(60, "Nome troppo lungo"),
  timezone: z.string().refine(isValidTimezone, "Timezone non valida"),
  baseCurrency: z.enum(CURRENCIES),
});

export type ProfileInput = z.infer<typeof profileSchema>;
