import { prisma } from "@/lib/db";
import {
  costruisciPannelloCot,
  type PannelloCot,
  type SerieCotPerStrumento,
} from "@/lib/cot-panel";
import type { CodiceStrumentoCot } from "@/lib/cot-sync";

/**
 * Carica le letture COT dalla tabella `CotWeek`, alimentata dal job
 * settimanale `cot-sync`. Dato di MERCATO unico per l'istanza: nessun filtro
 * per utente, come `MacroDeskReport`.
 *
 * LA TABELLA E IL CRON RESTANO anche dopo la rimozione della sezione
 * Posizionamento (27/08/2026): sparisce la pagina che interpretava male quei
 * numeri, non i numeri. Ne legge una riga per strumento la Sintesi.
 *
 * DIFENSIVA: qualunque errore (tabella non ancora migrata, database giù)
 * degrada a lista vuota con log, e la scheda mostra il motivo al posto della
 * cifra invece di cadere.
 */
export async function caricaPannelloCot(): Promise<PannelloCot> {
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
    return costruisciPannelloCot(serie);
  } catch (errore) {
    console.error("[cot] caricamento fallito:", errore);
    return { carte: [] };
  }
}
