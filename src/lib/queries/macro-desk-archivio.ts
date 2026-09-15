import { prisma } from "@/lib/db";
import type { VoceArchivio } from "@/lib/macro-desk-stato-report";

/**
 * L'archivio dei report per la pagina Report: solo le colonne che servono a
 * storico, vicini e stato (niente payload), nell'ordine dell'indice.
 *
 * Il tetto di 400 righe è largo — un anno e mezzo di giornalieri — e tiene la
 * query leggera anche quando l'archivio crescerà: lo storico ne mostra 20, i
 * vicini ne chiedono due.
 */
export function leggiArchivioReport(): Promise<VoceArchivio[]> {
  return prisma.macroDeskReport.findMany({
    select: {
      id: true,
      type: true,
      reportDate: true,
      generatedAt: true,
      biasXau: true,
      biasWti: true,
      biasIdx: true,
    },
    orderBy: [{ reportDate: "desc" }, { type: "asc" }],
    take: 400,
  });
}
