import { prisma } from "@/lib/db";
import {
  revisioneDaDire,
  type RevisioneDaDire,
} from "@/lib/macro-desk-versioni";

/**
 * La revisione da dire in pagina per un report, letta dal journal.
 *
 * Si prendono le ULTIME DUE versioni, non tutte: il payload pesa ~45 KB e per
 * dire «cosa è cambiato rispetto a prima» servono due, mentre il numero
 * d'ordine lo dà un `count` che non legge nessun payload.
 *
 * DIFENSIVA, come `getVolatilitaData`: qualunque errore — tabella non ancora
 * migrata sull'ambiente, database giù, riga illeggibile — degrada a `null` con
 * un log, e la pagina mostra il report senza la riga. È un di più d'archivio:
 * non deve poter impedire di leggere il report, che è l'esatto principio per
 * cui il journal non fa fallire l'upsert.
 */
export async function getRevisioneReport(
  reportId: string,
): Promise<RevisioneDaDire | null> {
  try {
    const [totale, ultime] = await Promise.all([
      prisma.macroDeskReportVersione.count({ where: { reportId } }),
      prisma.macroDeskReportVersione.findMany({
        where: { reportId },
        orderBy: { arrivatoIl: "desc" },
        take: 2,
        select: { arrivatoIl: true, payload: true },
      }),
    ]);
    // `findMany` le dà dalla più recente: qui servono in ordine di arrivo.
    const [corrente, precedente] = ultime;
    return revisioneDaDire(totale, precedente, corrente);
  } catch (e: unknown) {
    console.error("[macro-desk] journal delle versioni non leggibile:", e);
    return null;
  }
}
