import { cache } from "react";
import { prisma } from "@/lib/db";
import { parseMacroPayload, type MacroVolItem } from "@/lib/macro-desk-payload";

/**
 * Quel che resta del report giornaliero nella sezione Volatilità.
 *
 * COM'ERA fino al 26/08/2026: questa funzione era la fonte PRIMARIA della
 * sezione. Gli indici di volatilità implicita e la chiusura del giorno prima
 * entravano nel database solo dentro `MacroDeskReport.payload.volPanel` e
 * `.biasRecord`, cioè copiati a mano dalle pagine historical-data di
 * Investing.com.
 *
 * COM'È ORA: VIX, VVIX, SKEW, GVZ e OVX arrivano dal CDN del CBOE ogni notte,
 * insieme al resto dell'archivio. Di questa funzione restano due cose
 * soltanto, ed entrambe hanno un motivo per esserci:
 *
 *  - le voci di `volPanel` SENZA fonte gratuita — oggi il solo MOVE, indice
 *    proprietario ICE che FRED non ridistribuisce (404). Il filtro sta in
 *    `lib/volatilita-report.ts`, non qui: è una regola, non una query;
 *  - il commento del giorno, che è prosa e non ha alternative automatiche.
 *
 * Il `biasRecord` non si legge più: serviva solo a ricavare la chiusura del
 * giorno prima, e quella adesso viene dall'archivio.
 */

export interface VolatilitaData {
  /** Voci grezze del pannello del report: chi le rende le filtra. */
  items: MacroVolItem[];
  /** Commento del giorno sulla struttura vol, scritto dal report. */
  reading?: string;
  /** Vintage dichiarato dal report per le proprie voci. */
  asOf?: string;
  /** Report da cui arrivano i numeri: serve a datare la pagina e a linkarlo. */
  reportId: string;
  reportDate: Date;
}

/**
 * DIFENSIVA: qualunque errore — database giù, tabella non migrata, payload
 * illeggibile — degrada a `null` con log, e la pagina mostra i fatti
 * dell'archivio senza il blocco del report.
 */
export const getVolatilitaData = cache(
  async (): Promise<VolatilitaData | null> => {
    try {
      const row = await prisma.macroDeskReport.findFirst({
        where: { type: "DAILY" },
        orderBy: { reportDate: "desc" },
        select: { id: true, reportDate: true, payload: true },
      });
      if (!row) return null;

      const vol = parseMacroPayload(row.payload).volPanel;
      return {
        items: vol?.items ?? [],
        reading: vol?.reading,
        asOf: vol?.asOf,
        reportId: row.id,
        reportDate: row.reportDate,
      };
    } catch (e: unknown) {
      console.error("[volatilita] report non caricato:", e);
      return null;
    }
  },
);
