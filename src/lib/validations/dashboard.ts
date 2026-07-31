import { z } from "zod";
import {
  MOBILE_LAYOUT_DEFAULTS,
  WIDGET_IDS,
  type DashboardLayout,
  type WidgetId,
} from "@/lib/dashboard";

/*
 * Schemi del layout dashboard — separati da lib/dashboard.ts (P-02): il
 * parse gira SOLO sul server (page.tsx e server action), il client riceve
 * il layout già validato. Tenere lo schema nel modulo degli id trascinava
 * zod nel bundle client di 11 route.
 */

/** F26 — toggle del layout mobile, persistiti con chiave separata. */
export const mobileLayoutSchema = z.object({
  showAllMetrics: z.boolean().default(false),
  showAnalytics: z.boolean().default(false),
});

/**
 * Contenuto di `User.dashboardLayout` (Json).
 *
 * `hidden` accetta stringhe qualsiasi e FILTRA le sconosciute invece di
 * rifiutare il documento (Fase 26): quando un widget viene rimosso dal
 * codice (Monte Carlo → solo Analytics), i layout salvati che lo
 * nascondevano devono restare validi — con l'enum stretto il parse intero
 * falliva e l'utente perdeva TUTTE le sue preferenze, non solo quella
 * ormai irrilevante.
 */
export const dashboardLayoutSchema = z.object({
  hidden: z
    .array(z.string())
    .default([])
    .transform((ids) =>
      ids.filter((id): id is WidgetId =>
        (WIDGET_IDS as readonly string[]).includes(id),
      ),
    ),
  mobile: mobileLayoutSchema.default(MOBILE_LAYOUT_DEFAULTS),
});

export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(raw);
  return parsed.success
    ? parsed.data
    : { hidden: [], mobile: MOBILE_LAYOUT_DEFAULTS };
}
