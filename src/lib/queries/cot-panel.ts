import { prisma } from "@/lib/db";
import { contenutoContestoCotSchema } from "@/lib/cot-contesto";
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
    const pannello = costruisciPannelloCot(serie, oggi);

    // Box di contesto della settimana corrente: facoltativo per costruzione.
    // Qualunque intoppo (tabella non ancora migrata, contenuto non conforme,
    // settimana diversa) → il pannello esce SENZA sezione contesto, mai giù.
    if (pannello.meta) {
      try {
        const box = await prisma.cotContestoBox.findUnique({
          where: { settimanaCot: new Date(`${pannello.meta.aggiornatoAl}T00:00:00Z`) },
        });
        if (box) {
          const parsed = contenutoContestoCotSchema.safeParse(box.contenuto);
          if (parsed.success && parsed.data.settimanaCot === pannello.meta.aggiornatoAl) {
            pannello.contesto = {
              generatoIl: box.generatedAt.toISOString(),
              contenuto: parsed.data,
            };
          } else {
            console.error("[cot-panel] contesto scartato: contenuto non conforme");
          }
        }
      } catch (errore) {
        console.error("[cot-panel] contesto non caricato:", errore);
      }
    }
    return pannello;
  } catch (errore) {
    console.error("[cot-panel] caricamento fallito:", errore);
    return { carte: [], meta: null, contesto: null };
  }
}
