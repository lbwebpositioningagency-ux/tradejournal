import { prisma } from "@/lib/db";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { runSeasonalityDailyJob } from "@/lib/seasonality/job";

/** Margine largo sui tempi di rete; Vercel taglia al limite del piano. */
export const maxDuration = 300;

/**
 * GET /api/seasonality-sync — job notturno della Stagionalità, invocato dal
 * Vercel Cron (03:30 UTC, vedi vercel.json) o a mano per la verifica.
 *
 * Autenticazione identica al job COT: `Authorization: Bearer <CRON_SECRET>`,
 * confronto timing-safe e fail-closed (secret assente → nega). È l'header che
 * Vercel aggiunge da sé alle invocazioni cron quando la env var esiste sul
 * progetto.
 *
 * Risponde SEMPRE 200 con l'esito per strumento, come il job COT: una fonte
 * ritirata o una rete lenta finiscono nel corpo e nei log (`console.error` in
 * runSeasonalityDailyJob), mai in un crash che spegnerebbe il cron in
 * silenzio. `ok: false` nel corpo è il segnale da guardare.
 *
 * Questa route fa il DELTA giornaliero. Il primo popolamento gira a mano con
 * `npx tsx scripts/seasonality-backfill.ts`: vent'anni di storia da tre fonti
 * non stanno nei 300 secondi di una funzione.
 */
export async function GET(request: Request) {
  if (
    !isAuthorizedMacroRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const esito = await runSeasonalityDailyJob(prisma);
  return Response.json(esito);
}
