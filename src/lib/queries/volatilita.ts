import { cache } from "react";
import { prisma } from "@/lib/db";
import { parseMacroPayload, type MacroVolItem } from "@/lib/macro-desk-payload";
import { componiIngressi } from "@/lib/termometro-volatilita";

/**
 * Fonte della sezione Volatilità.
 *
 * ONESTÀ SULLA FONTE: a differenza di Posizionamento (`CotWeek`) e Driver
 * (`DriverDeskBar`), la volatilità NON ha una tabella propria. Gli indici IV e
 * la chiusura di ieri entrano nel database solo dentro l'ultimo report
 * giornaliero (`MacroDeskReport.payload.volPanel` e `.biasRecord`): quella è,
 * ad oggi, la sua fonte primaria. La sola parte indipendente dal report è la
 * tabella statica `termometro-volatilita.json`, che dà percentili e soglie.
 *
 * Conseguenza dichiarata: senza nemmeno un report giornaliero la sezione non ha
 * numeri da mostrare, e lo dice invece di fingere. Il giorno in cui gli indici
 * IV avranno un ingest proprio, basta cambiare questa funzione: la pagina e il
 * pannello non se ne accorgono.
 *
 * La stessa composizione è usata da `queries/ai-analyst.ts`, che legge lo
 * stesso report: i due restano allineati per costruzione.
 */

export interface VolatilitaData {
  /** Ingressi del termometro: IV di ieri + chiusura di ieri, già composti. */
  ingressi: ReturnType<typeof componiIngressi>;
  items: MacroVolItem[];
  /** Commento del giorno sulla struttura vol, scritto dal report. */
  reading?: string;
  asOf?: string;
  /** Report da cui arrivano i numeri: serve a datare la pagina e a linkarlo. */
  reportId: string;
  reportDate: Date;
}

/**
 * DIFENSIVA: qualunque errore — database giù, tabella non migrata, ma anche
 * un report i cui blocchi non si lasciano comporre — degrada a `null` con
 * log: la pagina mostra lo stato vuoto invece di cadere. La composizione sta
 * DENTRO lo stesso catch della query di proposito: il 10-13/08/2026 un
 * `biasRecord` di forma inattesa componeva fuori dal catch e la pagina
 * finiva in error boundary.
 */
export const getVolatilitaData = cache(
  async (): Promise<VolatilitaData | null> => {
    try {
      const row = await prisma.macroDeskReport.findFirst({
        where: { type: "DAILY" },
        orderBy: { reportDate: "desc" },
      });
      if (!row) return null;

      const vol = parseMacroPayload(row.payload).volPanel;
      return {
        ingressi: componiIngressi({
          volItems: vol?.items,
          biasRecord: row.biasRecord,
        }),
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
