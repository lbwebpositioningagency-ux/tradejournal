import { prisma } from "@/lib/db";
import {
  costruisciPannelloCot,
  type PannelloCot,
  type SerieCotPerStrumento,
} from "@/lib/cot-panel";
import type { CodiceStrumentoCot } from "@/lib/cot-sync";

/**
 * Carica il pannello COT dalla tabella `CotWeek` (alimentata dal job
 * settimanale di cot-sync). Dato di MERCATO unico per l'istanza: nessun
 * filtro per utente, come MacroDeskReport.
 *
 * DIFENSIVA: qualunque errore (tabella non ancora migrata, database giù)
 * degrada a pannello vuoto con log — il dettaglio report non deve cadere
 * per la sezione COT.
 */
export async function caricaPannelloCot(oggi: Date = new Date()): Promise<PannelloCot> {
  try {
    const righe = await prisma.cotWeek.findMany({
      orderBy: [{ instrument: "asc" }, { reportDate: "asc" }],
      select: {
        instrument: true,
        reportDate: true,
        openInterest: true,
        mmNet: true,
      },
    });

    const serie: SerieCotPerStrumento = {};
    for (const r of righe) {
      const strumento = r.instrument as CodiceStrumentoCot;
      const reportDate = r.reportDate.toISOString().slice(0, 10);
      const perStrumento = (serie[strumento] ??= {});
      (perStrumento.mm_net ??= []).push({ reportDate, valore: r.mmNet });
      (perStrumento.open_interest ??= []).push({ reportDate, valore: r.openInterest });
    }
    /* Dal 26/08/2026 non si carica più nessun box di contesto: i titoli da
       Google News sono stati tolti dal pannello (motivo in cot-panel.tsx) e
       l'implicazione meccanica non ha bisogno di una riga in tabella. */
    return costruisciPannelloCot(serie, oggi);
  } catch (errore) {
    console.error("[cot-panel] caricamento fallito:", errore);
    return { carte: [], meta: null };
  }
}
