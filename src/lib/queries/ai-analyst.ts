/**
 * Le fonti che alimentano le SCHEDE PER STRUMENTO della Sintesi — l'unico
 * pezzo con I/O di quella pagina.
 *
 * Legge le stesse funzioni che alimentano le altre sezioni del Macro Desk e
 * non ricalcola niente per conto proprio; la composizione delle righe sta nel
 * modulo puro `src/lib/ai-analyst/scheda-strumento.ts`.
 *
 * ── COS'È DIMAGRITO, IL 27/08/2026 ───────────────────────────────────────
 *
 * Questo file caricava anche il Driver Desk, la copertura della Stagionalità,
 * cinque serie di Trends e la data dell'ultimo report, e aveva un
 * orchestratore (`caricaLetture`) che ne ricavava dodici letture per il
 * dossier dell'AI Analyst. Con il blocco discorsivo è sparito il dossier, e
 * con il dossier ogni consumatore di quelle fonti: le schede leggono il
 * contesto di volatilità, il pannello COT e le due strutture a termine, e
 * nient'altro.
 *
 * Non è un'economia cosmetica: erano **otto query in meno per apertura di
 * pagina**, fra cui l'intero Driver Desk (quattro schede con le loro serie) e
 * la sezione Trends. Restano le due che servono davvero.
 *
 * Disciplina invariata: una fonte che cade non fa cadere le altre, e dove il
 * dato non c'è si mostra il motivo invece di un valore di comodo.
 */

import { cache } from "react";
import {
  getContestoVolatilita,
  type ContestoVolatilita,
  type RigaContestoVol,
  type StrutturaTermine,
} from "@/lib/queries/volatilita-contesto";
import type { EsitoStrutturaWti } from "@/lib/queries/wti-termine";
import { caricaPannelloCot } from "@/lib/queries/cot-panel";
import type { PannelloCot } from "@/lib/cot-panel";
import { CLOCK_TIMEZONE, zonedParts } from "@/lib/seasonality/buckets";

/** Giorno civile italiano: le granularità di calendario del progetto vivono lì. */
export function giornoRoma(now: Date = new Date()): string {
  const p = zonedParts(now, CLOCK_TIMEZONE.ROME);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export interface FontiCondivise {
  /** Posizionamento COT: la sola riga `mm_net` finisce nelle schede. */
  cot: PannelloCot;
  /**
   * Fatti di volatilità dall'archivio giornaliero, per codice di indice IV.
   * Sta QUI e non nella composizione perché serve a tutti e quattro gli
   * strumenti e la query scandisce serie intere: farla una volta sola non è
   * un'ottimizzazione, è la differenza fra una e otto scansioni.
   */
  contesto: Map<string, RigaContestoVol>;
  /** Curva del VIX: serve alla scheda dell'S&P 500. */
  strutturaTermine: StrutturaTermine | null;
  /** Curva del WTI: serve alla scheda del WTI. */
  strutturaWti: EsitoStrutturaWti;
}

/**
 * Tutto ciò che si legge UNA volta sola e serve a tutte e quattro le schede.
 * `cache` di React deduplica dentro la stessa richiesta.
 */
export const caricaFontiCondivise = cache(async (): Promise<FontiCondivise> => {
  const [cot, contestoVol] = await Promise.all([
    caricaPannelloCot(),
    getContestoVolatilita(giornoRoma()).catch((e: unknown) => {
      console.error("[sintesi] contesto volatilità non caricato:", e);
      const vuoto: ContestoVolatilita = {
        righe: [],
        oggi: giornoRoma(),
        strutturaTermine: null,
        strutturaWti: { ok: false, motivo: "front_non_disponibile" },
        climaCopertura: [],
      };
      return vuoto;
    }),
  ]);

  const contesto = new Map<string, RigaContestoVol>();
  for (const riga of contestoVol.righe) contesto.set(riga.indice, riga);

  return {
    cot,
    contesto,
    strutturaTermine: contestoVol.strutturaTermine,
    strutturaWti: contestoVol.strutturaWti,
  };
});
