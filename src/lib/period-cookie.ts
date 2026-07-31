import { cookies } from "next/headers";
import { decodePeriodCookie, PERIOD_COOKIE, type PeriodParams } from "./period";

/**
 * B3-4 — lettura server del periodo ricordato (scritto dal PeriodFilter):
 * fa da `fallback` a `resolvePeriod` SOLO quando l'URL non porta un
 * `period` esplicito. Modulo separato da period.ts perché `next/headers`
 * non può entrare nel grafo client (period.ts è importato dai filtri).
 */
export async function periodCookieFallback(): Promise<
  PeriodParams | undefined
> {
  const store = await cookies();
  return decodePeriodCookie(store.get(PERIOD_COOKIE)?.value);
}
