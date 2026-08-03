import { prisma } from "@/lib/db";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { BUDGET_DEFAULT_MS, runSeasonalityDailyJob } from "@/lib/seasonality/job";

/** Margine sul limite di piattaforma; il budget interno del job è più stretto. */
export const maxDuration = 300;

/**
 * GET /api/seasonality-sync — job della Stagionalità.
 *
 * È **sia** il cron notturno (03:30 UTC, vedi vercel.json) **sia** il trigger
 * manuale: dopo un deploy si può richiamare a mano per avviare il primo
 * caricamento senza aspettare la notte.
 *
 * ── Il job è a BUDGET e converge su più invocazioni ───────────────────────
 *
 * Un'invocazione fa quello che sta nel budget (predefinito 50 s, sotto il
 * limite del piano Hobby) e poi si ferma dichiarando dove è arrivata. La
 * risposta porta `completo` e `prossimo`: finché `completo` è falso, va
 * richiamato. Le esecuzioni successive riprendono dal cursore, non da capo.
 *
 * Per il primo popolamento in produzione: chiamarlo in sequenza finché
 * `completo` non diventa `true`. Dopo la PRIMA chiamata le schede Mese,
 * Settimana e Giorno sono già utili — l'intraday converge nelle successive.
 *
 * Parametri (tutti opzionali):
 * - `?budget=<ms>`   budget diverso dal predefinito, entro `maxDuration`;
 * - `?intraday=0`    solo giornaliero;
 * - `?force=1`       rifà il giornaliero anche se è fresco.
 *
 * Autenticazione: `Authorization: Bearer <CRON_SECRET>`, confronto
 * timing-safe e fail-closed. È l'header che Vercel aggiunge da sé alle
 * invocazioni cron quando la env var esiste sul progetto.
 *
 * Risponde SEMPRE 200 con l'esito per strumento: una fonte ritirata o una
 * rete lenta finiscono nel corpo e nei log, mai in un crash che spegnerebbe
 * il cron in silenzio.
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

  const url = new URL(request.url);
  const budgetParam = Number(url.searchParams.get("budget"));
  /* Il budget richiesto viene comunque limitato: un valore assurdo porterebbe
     al taglio brutale della funzione, che è esattamente ciò che si evita. */
  const budgetMs =
    Number.isFinite(budgetParam) && budgetParam > 1000
      ? Math.min(budgetParam, (maxDuration - 10) * 1000)
      : BUDGET_DEFAULT_MS;

  const esito = await runSeasonalityDailyJob(prisma, {
    budgetMs,
    intraday: url.searchParams.get("intraday") !== "0",
    forceDaily: url.searchParams.get("force") === "1",
  });

  return Response.json({
    ...esito,
    // Istruzione esplicita al chiamante: nessuno deve dedurla dai campi.
    richiamare: !esito.completo,
  });
}
