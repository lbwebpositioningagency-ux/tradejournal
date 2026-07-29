import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  parseWeeklyBiasRecord,
  type WeeklyBiasRecord,
} from "@/lib/macro-desk-bias-record";

/**
 * Righe per la scorecard a Expected Move.
 *
 * Il filtro di idoneità sta QUI, in un posto solo, e replica il §2 del brief:
 * - `schemaVersion` assente → payload legacy v1, fuori da ogni conteggio.
 *   È questo che azzera il track record senza cancellare un solo report: i
 *   68 report storici restano consultabili in archivio, alimentano ancora
 *   "Bias del giorno" e "Bias × esecuzione", e semplicemente non entrano qui.
 * - `scorecardEligible: false` → report informativo (i run ponte del 29-31
 *   luglio), escluso anche se v2.
 *
 * Il Weekly Bias Record viene aggiornato dai report giornalieri: per ogni
 * settimana si tiene il record PIÙ RECENTE, che è quello col percorso
 * completo fino a venerdì.
 */

export interface ScorecardSource {
  records: WeeklyBiasRecord[];
  /** Report v2 idonei letti (per dichiarare la copertura in pagina). */
  eligibleReports: number;
  /** Report esclusi perché legacy o marcati non idonei. */
  excludedReports: number;
  /** Giorno di partenza del track record, se il desk l'ha dichiarato. */
  trackRecordStart: string | null;
}

export async function getScorecardSource(): Promise<ScorecardSource> {
  const [rows, excludedReports, startRow] = await Promise.all([
    prisma.macroDeskReport.findMany({
      where: {
        schemaVersion: { not: null },
        NOT: { scorecardEligible: false },
        biasRecord: { not: Prisma.DbNull },
      },
      orderBy: [{ reportDate: "asc" }, { generatedAt: "asc" }],
      select: { reportDate: true, biasRecord: true },
    }),
    prisma.macroDeskReport.count({
      where: {
        OR: [{ schemaVersion: null }, { scorecardEligible: false }],
      },
    }),
    prisma.macroDeskReport.findFirst({
      where: { trackRecordStart: true },
      orderBy: { reportDate: "asc" },
      select: { reportDate: true },
    }),
  ]);

  // Un record per settimana: l'ultimo arrivato vince, perché porta il
  // percorso più completo. I report sono già in ordine cronologico.
  const byWeek = new Map<string, WeeklyBiasRecord>();
  for (const row of rows) {
    const parsed = parseWeeklyBiasRecord(row.biasRecord);
    if (!parsed) continue;
    byWeek.set(parsed.weekStart, parsed);
  }

  return {
    records: [...byWeek.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    ),
    eligibleReports: rows.length,
    excludedReports,
    trackRecordStart: startRow
      ? startRow.reportDate.toISOString().slice(0, 10)
      : null,
  };
}
