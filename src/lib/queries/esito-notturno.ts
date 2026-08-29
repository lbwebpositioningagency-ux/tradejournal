import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * ESITO DELL'ULTIMO GIRO NOTTURNO — la rete che rende visibile un cron rotto.
 *
 * ── Il problema che chiude ────────────────────────────────────────────────
 *
 * `/api/seasonality-sync` risponde già 500 quando una serie manca o va in
 * errore. Ma un cron Vercel che fallisce non avvisa nessuno: il codice di
 * stato finisce in una dashboard che nessuno apre. Prova concreta, trovata il
 * 29/08/2026: `DGS10` è nel catalogo del Driver Desk e nell'enum di
 * produzione, ma non ha mai avuto una riga di coverage — quindi l'ingest la
 * salta dichiarandola in errore e il cron risponde 500 OGNI NOTTE. Nessuno se
 * n'era accorto.
 *
 * ── Perché QUESTO canale ──────────────────────────────────────────────────
 *
 * Nessuna infrastruttura nuova: la tabella `SeasonalityRun` c'è già e viene
 * scritta ogni notte, e l'indice del Macro Desk ha già il posto per una banda
 * di allarme (`BandaFreschezza`, stesso schema). Serviva solo che la riga
 * dicesse la verità: fino a oggi `ok` rifletteva la sola Stagionalità, ed era
 * `true` anche nelle notti in cui il Driver Desk falliva. Adesso il
 * dispatcher ci riscrive sopra l'esito COMPLESSIVO — stagionalità, driver e
 * migrazioni — e chi apre il Macro Desk lo vede.
 *
 * È un canale PASSIVO: avvisa chi entra, non chi non entra. È il prezzo di
 * «niente infrastruttura nuova», ed è dichiarato qui perché chi legge non lo
 * scambi per una notifica.
 */

export interface EsitoNotturno {
  /** L'ultimo giro registrato è andato a buon fine? */
  ok: boolean;
  /** Istante di fine dell'ultimo giro, o null se non è mai girato. */
  quando: Date | null;
  /** Righe di dettaglio già in italiano, pronte da mostrare. */
  motivi: string[];
}

/** Chiavi che il dispatcher scrive in `detail` dopo la verifica. */
export interface DettaglioVerifica {
  verifica?: {
    stagionalita?: { messaggio?: string; riuscito?: boolean };
    driver?: { messaggio?: string; riuscito?: boolean };
    migrazioni?: { messaggio?: string; allineate?: boolean | null };
  };
}

/**
 * Le righe da mostrare, dal `detail` della riga di registro. Funzione PURA e
 * separata dalla query proprio per poterla testare senza database.
 *
 * Elenca solo ciò che è ANDATO MALE: un elenco che dice anche cosa ha
 * funzionato è un elenco che nessuno finisce di leggere. Le migrazioni
 * entrano anche quando lo stato è ignoto (`null`), perché uno schema di stato
 * ignoto non è uno schema sano.
 */
export function motiviDaVerifica(detail: unknown): string[] {
  const d = (detail ?? {}) as DettaglioVerifica;
  const v = d.verifica;
  const motivi: string[] = [];
  if (v?.stagionalita?.riuscito === false && v.stagionalita.messaggio) {
    motivi.push(`Stagionalità: ${v.stagionalita.messaggio}`);
  }
  if (v?.driver?.riuscito === false && v.driver.messaggio) {
    motivi.push(`Driver Desk: ${v.driver.messaggio}`);
  }
  if (v?.migrazioni && v.migrazioni.allineate !== true) {
    motivi.push(
      `Migrazioni: ${v.migrazioni.messaggio ?? "stato dello schema ignoto"}`,
    );
  }
  return motivi;
}

export const getEsitoNotturno = cache(
  async (): Promise<EsitoNotturno | null> => {
    const run = await prisma.seasonalityRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { ok: true, finishedAt: true, startedAt: true, detail: true },
    });
    if (!run) return null;

    return {
      ok: run.ok,
      quando: run.finishedAt ?? run.startedAt,
      motivi: motiviDaVerifica(run.detail),
    };
  },
);
