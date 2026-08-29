import { prisma } from "@/lib/db";
import { DRIVER_SERIES } from "@/lib/driver-desk/catalog";
import { runDriverDeskDeltaIngest } from "@/lib/driver-desk/ingest";
import {
  statusPerEsito,
  verificaEsitoJob,
  type EsitoSerie,
} from "@/lib/job-esito";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { descriviConfronto } from "@/lib/migrazioni";
import { verificaMigrazioni } from "@/lib/queries/migrazioni";
import {
  AVAILABLE_INSTRUMENTS,
  LOOKBACK_YEARS,
} from "@/lib/seasonality/instruments";
import { sospette } from "@/lib/seasonality/impronta";
import { registraImpronta } from "@/lib/seasonality/impronta-store";
import { BUDGET_DEFAULT_MS, runSeasonalityDailyJob } from "@/lib/seasonality/job";

/** Margine sul limite di piattaforma; il budget interno del job è più stretto. */
export const maxDuration = 300;

/**
 * GET /api/seasonality-sync — DISPATCHER del cron notturno (03:30 UTC, vedi
 * vercel.json): prima il job della Stagionalità, poi l'ingest DELTA del
 * Driver Desk. Due lavori in un solo cron, di proposito: il piano resta a
 * due cron e il Driver Desk smette di dipendere da rilanci manuali
 * (riparazione del 13/08/2026 — dati fermi al backfill del 04/08).
 *
 * È **sia** il cron notturno **sia** il trigger manuale: dopo un deploy si
 * può richiamare a mano per avviare il primo caricamento senza aspettare la
 * notte.
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
 * Non lancia MAI: una fonte ritirata o una rete lenta finiscono nel corpo e
 * nei log, mai in un crash che spegnerebbe il cron in silenzio. Il codice di
 * stato però dichiara l'esito — 500 quando la verifica non è riuscita, perché
 * è l'unico segnale che Vercel mostra rosso senza doverlo cercare nei log.
 *
 * Tre cose lo fanno diventare rosso: una serie della Stagionalità senza
 * esito o in errore, una del Driver Desk, e — dal 28/08/2026 — uno schema di
 * database indietro rispetto al codice deployato (v. il blocco MIGRAZIONI in
 * fondo, e `scripts/migra.ts` per il perché).
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

  const inizio = Date.now();
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

  /* ── Driver Desk: ingest delta col tempo che resta ────────────────────
     La stagionalità ha la precedenza; al driver va il residuo della
     funzione meno un margine di sicurezza. Misurato il 13/08/2026 su dati
     di produzione: 4,8 s per tutte e 13 le serie (max per serie 1,3 s,
     Bundesbank) — contro i ~230 s tipicamente residui, quindi nessun
     cursore persistente: se una notte il tempo non bastasse, il delta
     rinvia le serie restanti (`completo: false`) e la finestra di 14
     giorni ricuce alla notte dopo. */
  const margineMs = 20_000;
  const residuoMs = maxDuration * 1000 - (Date.now() - inizio) - margineMs;
  const driverDesk =
    residuoMs < 15_000
      ? {
          saltato: true as const,
          motivo: "tempo residuo insufficiente dopo la stagionalità",
        }
      : await runDriverDeskDeltaIngest(prisma, { budgetMs: residuoMs }).catch(
          (e: unknown) => {
            /* Il delta non deve mai spegnere il cron della stagionalità. */
            console.error("[driver-desk] delta fallito:", e);
            return { saltato: true as const, motivo: String(e) };
          },
        );

  /* ── IMPRONTA: cos'è cambiato nei valori memorizzati, e quando ────────
     Si prende DOPO la scrittura, rileggendo dal database quello che la pagina
     leggerà. Le due sentinelle precedenti guardano la scrittura (colonne
     perse, righe perse); questa guarda il RISULTATO, e prende il caso che
     nessuna delle due vede: una media che si muove a campione invariato.
     Non deve mai spegnere il cron — un registro che fa fallire il giro che
     doveva sorvegliare sarebbe il contrario di una rete di sicurezza. */
  const impronte = new Map<string, string[]>();
  const esitoPerCodice = new Map(esito.strumenti.map((s) => [s.strumento, s]));
  for (const def of AVAILABLE_INSTRUMENTS) {
    const s = esitoPerCodice.get(def.code);
    if (!s || s.esito === "errore" || s.esito === "in_coda") continue;
    try {
      const reg = await registraImpronta(
        prisma,
        def.code,
        LOOKBACK_YEARS,
        new Date(),
      );
      if (reg.cambiata) {
        const gravi = sospette(reg.variazioni);
        if (gravi.length > 0) impronte.set(def.code, gravi);
        console.log(
          `[impronta] ${def.code}: ${reg.variazioni.length} variazioni` +
            `${reg.precedenteDal ? `, il valore precedente reggeva dal ${reg.precedenteDal.toISOString()}` : ""}`,
        );
      }
    } catch (e: unknown) {
      console.error(`[impronta] ${def.code} non registrata:`, e);
    }
  }

  /* ── VERIFICA DI ESITO REALE ──────────────────────────────────────────
     Un cron che gira, non scrive e risponde 200 è indistinguibile da uno
     che funziona: è già costato report persi. Il confronto è fra le serie
     ATTESE (dal catalogo) e quelle di cui è davvero arrivato un esito —
     così una serie che nessun ramo ha nemmeno tentato non passa più
     inosservata, che era il caso invisibile.
     "Nessuna novità dall'upstream" NON è un fallimento: WTI e Brent
     arrivano dall'EIA via FRED, che pubblica con circa una settimana di
     ritardo, e farli fallire ogni notte sarebbe rumore, non un allarme. */
  const esitiStagionalita: EsitoSerie[] = esito.strumenti.map((s) => ({
    codice: s.strumento,
    stato:
      s.esito === "errore"
        ? "errore"
        : s.esito === "aggiornato"
          ? "aggiornato"
          : "invariato",
    scritte: s.barre,
    dettaglio: s.messaggio ?? undefined,
    /* Colonne perse = fallimento, come le serie mai tentate. Se la fonte
       dava open/high/low e nel database è finita la sola chiusura, il cron
       risponde 500 invece di dichiararsi verde: v. `perditaOhlc`. */
    ohlc: s.ohlc ?? undefined,
    /* Righe perse o mesi vuoti = fallimento, per la stessa ragione delle
       colonne perse: il 26/08/2026 l'oro ha perso tutto il 2005 e il cron era
       verde. V. `perditaContinuita`. */
    continuita: s.continuita ?? undefined,
    /* Un valore cambiato senza ragione legittima = fallimento: v. sopra. */
    improntaSospetta: impronte.get(s.strumento),
  }));
  const verificaStagionalita = verificaEsitoJob(
    AVAILABLE_INSTRUMENTS.map((i) => i.code),
    esitiStagionalita,
  );

  const esitiDriver: EsitoSerie[] =
    "results" in driverDesk
      ? driverDesk.results.map((r) => ({
          codice: r.series,
          stato: r.ok ? (r.rows ? "aggiornato" : "invariato") : "errore",
          scritte: r.rows ?? 0,
          dettaglio: r.error,
        }))
      : [];
  /* Il delta saltato per tempo residuo è previsto e non è un fallimento: la
     finestra di 14 giorni ricuce alla notte dopo. Saltato per ECCEZIONE sì. */
  const driverPrevisto =
    "saltato" in driverDesk && driverDesk.motivo.startsWith("tempo residuo")
      ? []
      : DRIVER_SERIES.map((s) => s.code);
  const verificaDriver = verificaEsitoJob(driverPrevisto, esitiDriver);

  /* ── MIGRAZIONI: lo schema è allineato al codice che sta girando? ─────
     Dal 28/08/2026 `prisma migrate deploy` non è più nella build — lo era, e
     poiché `DATABASE_URL` è un solo record Vercel con target
     `["production","preview"]`, un push di branch applicava migrazioni alla
     PRODUZIONE. Toglierlo introduce il rischio opposto: codice deployato che
     presuppone una migrazione mai applicata.
     Il controllo sta QUI e non solo in `/api/health/migrazioni` perché una
     rotta che nessuno chiama è una convenzione travestita da meccanismo:
     questo cron gira ogni notte, quindi la cecità massima è di 24 ore.
     Non poter rispondere è trattato come rosso: uno schema di stato ignoto
     non è uno schema sano. */
  const migrazioni = await verificaMigrazioni().catch((e: unknown) => {
    console.error("[seasonality-sync] confronto migrazioni non riuscito:", e);
    return null;
  });
  const migrazioniAllineate = migrazioni?.allineate ?? false;

  const riuscito =
    verificaStagionalita.riuscito && verificaDriver.riuscito && migrazioniAllineate;
  if (!riuscito) {
    console.error(
      `[seasonality-sync] esito NON riuscito · stagionalità: ${verificaStagionalita.messaggio} · driver: ${verificaDriver.messaggio}`,
    );
  }
  /* ── IL REGISTRO DEVE DIRE LA VERITÀ ──────────────────────────────────
     `SeasonalityRun` viene scritta dal job della Stagionalità, che di suo non
     sa niente né del Driver Desk né delle migrazioni: fino al 29/08/2026 la
     riga risultava `ok: true` anche nelle notti in cui il driver falliva. È
     così che `DGS10` — nel catalogo e nell'enum di produzione, ma senza riga
     di coverage — ha fatto rispondere 500 a questo endpoint per giorni senza
     che nessuna traccia leggibile lo dicesse.

     Qui sopra ci scriviamo l'esito COMPLESSIVO, ed è quello che l'indice del
     Macro Desk mostra in banda (v. `getEsitoNotturno`): il 500 resta, ma
     smette di essere l'unico posto dove il fallimento esiste.

     Non deve mai far cadere la risposta: se questa scrittura fallisce, il
     giro è comunque avvenuto e l'esito va restituito lo stesso. */
  await prisma.seasonalityRun
    .update({
      where: { id: esito.runId },
      data: {
        ok: riuscito,
        detail: {
          fase: esito.fase,
          completo: esito.completo,
          prossimo: esito.prossimo,
          strumenti: esito.strumenti.map((x) => ({
            strumento: x.strumento,
            esito: x.esito,
            barre: x.barre,
          })),
          verifica: {
            riuscito,
            stagionalita: {
              riuscito: verificaStagionalita.riuscito,
              messaggio: verificaStagionalita.messaggio,
            },
            driver: {
              riuscito: verificaDriver.riuscito,
              messaggio: verificaDriver.messaggio,
            },
            migrazioni: {
              allineate: migrazioni?.allineate ?? null,
              messaggio: migrazioni
                ? descriviConfronto(migrazioni)
                : "confronto non riuscito, stato dello schema ignoto",
            },
          },
        },
      },
    })
    .catch((e: unknown) => {
      console.error("[seasonality-sync] registro non aggiornato:", e);
    });

  if (!migrazioniAllineate) {
    /* Riga PROPRIA e coi NOMI: un rosso senza dettaglio costa mezz'ora di
       caccia per scoprire quale migrazione manca. */
    console.error(
      `[seasonality-sync] MIGRAZIONI: ${
        migrazioni
          ? descriviConfronto(migrazioni)
          : "confronto non riuscito, stato dello schema ignoto"
      }`,
    );
  }

  return Response.json(
    {
      ...esito,
      driverDesk,
      migrazioni: migrazioni
        ? {
            allineate: migrazioni.allineate,
            mancanti: migrazioni.mancanti,
            sconosciute: migrazioni.sconosciute,
            attese: migrazioni.attese,
            applicate: migrazioni.applicate,
            messaggio: descriviConfronto(migrazioni),
          }
        : {
            allineate: null,
            messaggio:
              "Confronto delle migrazioni non riuscito: stato dello schema ignoto.",
          },
      verifica: {
        riuscito,
        stagionalita: verificaStagionalita,
        driver: verificaDriver,
        migrazioniAllineate,
      },
      // Istruzione esplicita al chiamante: nessuno deve dedurla dai campi.
      richiamare: !esito.completo,
    },
    { status: statusPerEsito({ ...verificaStagionalita, riuscito }) },
  );
}
