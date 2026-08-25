import { prisma } from "@/lib/db";
import { eseguiJobContestoCot } from "@/lib/cot-contesto-job";
import { cotSyncDbPrisma, runCotSync, STRUMENTI_COT } from "@/lib/cot-sync";
import {
  statusPerEsito,
  verificaEsitoJob,
  type EsitoSerie,
} from "@/lib/job-esito";
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

  /* Stesso punto cieco della stagionalità, stessa chiusura: la route
     rispondeva 200 anche con TUTTI gli strumenti in "contratto_non_trovato"
     — cioè il caso della rinomina CFTC, che è proprio quello per cui questo
     job esiste — o in errore di rete. "gia_aggiornato" resta un successo: il
     COT esce una volta a settimana e le altre esecuzioni non trovano nulla
     di nuovo per costruzione. */
  const esitiCot: EsitoSerie[] = esito.strumenti.map((s) => ({
    codice: s.strumento,
    stato:
      s.esito === "aggiornato"
        ? "aggiornato"
        : s.esito === "gia_aggiornato"
          ? "invariato"
          : "errore",
    scritte: s.inserite,
    dettaglio: s.esito,
  }));
  const verifica = verificaEsitoJob(STRUMENTI_COT, esitiCot);
  if (!verifica.riuscito) {
    console.error(`[cot-sync] esito NON riuscito · ${verifica.messaggio}`);
  }

  return Response.json(
    { ...esito, contesto: contesto.esito, verifica },
    { status: statusPerEsito(verifica) },
  );
}
