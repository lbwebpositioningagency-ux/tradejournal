import { prisma } from "@/lib/db";
import { eseguiJobContestoCot } from "@/lib/cot-contesto-job";
import { cotSyncDbPrisma, runCotSync } from "@/lib/cot-sync";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";

/** Sync CFTC + feed RSS + cancello semantico: margine largo sui tempi di
 * rete, Vercel taglia al limite del piano se inferiore. */
export const maxDuration = 300;

/**
 * GET /api/cot-sync — job settimanale COT, invocato dal Vercel Cron (sabato
 * mattina, vedi vercel.json) o a mano per la verifica.
 *
 * Protetta da `Authorization: Bearer <CRON_SECRET>`: è l'header che Vercel
 * aggiunge da sé alle invocazioni cron quando l'env var CRON_SECRET esiste
 * sul progetto. Stesso confronto timing-safe e fail-closed dell'endpoint
 * Macro Desk.
 *
 * Risponde SEMPRE 200 con l'esito dettagliato per strumento: i problemi
 * (contratto rinominato, rete, dato stantio) sono dichiarati nel corpo e nei
 * log (`console.error` in runCotSync), mai un crash del job — così un nome
 * di contratto sparito non fa fallire per sempre il cron in silenzio.
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

  // 1) prima il numero nuovo…
  const esito = await runCotSync(cotSyncDbPrisma(prisma));
  // 2) …poi, IN SEQUENZA, il contesto per quel numero. Non lancia mai: se
  // fallisce (chiave, rete, cancelli) il box della settimana non esiste e
  // il resto del pannello resta invariato.
  const contesto = await eseguiJobContestoCot(prisma);
  return Response.json({ ...esito, contesto: contesto.esito });
}
