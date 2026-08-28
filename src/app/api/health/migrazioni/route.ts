import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { descriviConfronto } from "@/lib/migrazioni";
import { verificaMigrazioni } from "@/lib/queries/migrazioni";

/**
 * GET /api/health/migrazioni — lo schema del database è allineato al codice
 * che sta girando?
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────
 *
 * Dal 28/08/2026 `prisma migrate deploy` non sta più nella build: applicare
 * le migrazioni è un passo deliberato (`npm run db:deploy`). Il guadagno è
 * che un deploy di anteprima non tocca più lo schema di produzione —
 * `DATABASE_URL` è un unico record Vercel con target
 * `["production","preview"]`. Il rischio simmetrico è che il codice arrivi in
 * produzione prima della sua migrazione.
 *
 * Il dispatcher `/api/seasonality-sync` accende la spia una volta a notte.
 * Questa rotta serve per NON aspettare la notte: è una `curl` subito dopo un
 * deploy, e risponde con l'elenco esatto delle migrazioni mancanti.
 *
 * 200 = allineato · 500 = schema indietro rispetto al codice.
 *
 * Autenticazione: la stessa dei cron (`Authorization: Bearer <CRON_SECRET>`,
 * confronto timing-safe, fail-closed). L'elenco delle migrazioni dice quali
 * tabelle e colonne stanno per esistere: non è un dato da lasciare aperto.
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

  try {
    const confronto = await verificaMigrazioni();
    return Response.json(
      {
        allineate: confronto.allineate,
        /* I NOMI, sempre e per esteso: è il primo dato che serve a chi
           riceve il rosso, e ricavarlo altrimenti costa una caccia. */
        mancanti: confronto.mancanti,
        sconosciute: confronto.sconosciute,
        attese: confronto.attese,
        applicate: confronto.applicate,
        messaggio: descriviConfronto(confronto),
      },
      { status: confronto.allineate ? 200 : 500 },
    );
  } catch (errore) {
    /* Non poter rispondere alla domanda NON è una risposta rassicurante: se
       il confronto non si può fare, si dichiara rosso invece di tacere. */
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error("[health/migrazioni] confronto non riuscito:", messaggio);
    return Response.json(
      {
        allineate: null,
        errore: messaggio,
        messaggio:
          "Confronto delle migrazioni non riuscito: lo stato dello schema resta ignoto.",
      },
      { status: 500 },
    );
  }
}
