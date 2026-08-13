import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  valutaFreschezzaReport,
  type FreschezzaReport,
} from "@/lib/macro-desk-freschezza";

/**
 * Freschezza dell'ultimo report giornaliero, per la banda dell'indice.
 *
 * Si misura su `generatedAt` (quando il desk ha prodotto il report) e non su
 * `createdAt`: la domanda a cui risponde la banda è "quanto è vecchio il dato
 * che sto guardando", non "quando l'abbiamo ricevuto".
 *
 * DIFENSIVA, ma con una distinzione che conta: se la query FALLISCE non si
 * dichiara "nessun report" — sarebbe una diagnosi sbagliata di un problema
 * diverso (database irraggiungibile). In quel caso la banda tace e il guasto
 * si manifesta dove è davvero, nelle sezioni che leggono i dati.
 */
export const getFreschezzaReport = cache(
  async (adesso: Date = new Date()): Promise<FreschezzaReport | null> => {
    try {
      const ultimo = await prisma.macroDeskReport.findFirst({
        where: { type: "DAILY" },
        orderBy: { reportDate: "desc" },
        select: { generatedAt: true },
      });
      return valutaFreschezzaReport(ultimo?.generatedAt ?? null, adesso);
    } catch (e: unknown) {
      console.error("[macro-desk] freschezza non verificabile:", e);
      return null;
    }
  },
);
