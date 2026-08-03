import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { SEASONALITY_INSTRUMENTS } from "@/lib/seasonality/instruments";

/** Margine largo sui tempi di rete; Vercel taglia al limite del piano. */
export const maxDuration = 300;

/**
 * GET /api/seasonality-sync — job notturno della Stagionalità, invocato dal
 * Vercel Cron (03:30 UTC, vedi vercel.json) o a mano per la verifica.
 *
 * FASE 0: l'endpoint esiste, è PROTETTO e non fa NIENTE. Nessuna rete verso
 * le fonti, nessuna scrittura sul database. Risponde con l'inventario di ciò
 * che dovrà fare, così il cron si può collegare e verificare (401 senza
 * token, 200 con) prima che esista una riga di ingest.
 *
 * Autenticazione identica al job COT: `Authorization: Bearer <CRON_SECRET>`,
 * confronto timing-safe e fail-closed (secret assente → nega). È l'header che
 * Vercel aggiunge da sé alle invocazioni cron quando la env var esiste sul
 * progetto.
 *
 * Come il job COT, risponderà SEMPRE 200 con l'esito dettagliato: una fonte
 * ritirata o una rete lenta finiscono nel corpo e nei log, mai in un crash
 * che spegnerebbe il cron in silenzio.
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

  return Response.json({
    ok: true,
    fase: 0,
    eseguito: false,
    messaggio:
      "Impalcatura: l'ingest e il precalcolo arrivano nelle fasi 1-3. Nessuna fonte contattata, nessuna scrittura sul database.",
    strumenti: SEASONALITY_INSTRUMENTS.map((i) => ({
      codice: i.code,
      tipo: i.kind,
      intraday: i.hourly !== null,
      indisponibile: i.unavailable ?? null,
    })),
  });
}
