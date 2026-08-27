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

/** Una segnalazione di impegno rifiutato, pronta per la resa. */
export interface ImpegnoRifiutatoDiReport {
  reportDate: string;
  tipo: string;
  rifiutate: { campo: string; tenuto: string; rifiutato: string }[];
}

export interface ScorecardSource {
  records: WeeklyBiasRecord[];
  /** Report v2 idonei letti (per dichiarare la copertura in pagina). */
  eligibleReports: number;
  /** Report esclusi perché legacy o marcati non idonei. */
  excludedReports: number;
  /** Giorno di partenza del track record, se il desk l'ha dichiarato. */
  trackRecordStart: string | null;
  /**
   * Report che hanno provato a cambiare l'impegno della domenica a settimana
   * aperta. Vuoto quasi sempre, ed è il caso giusto: quando non lo è, chi
   * legge i risultati deve saperlo insieme ai risultati.
   */
  impegniRifiutati: ImpegnoRifiutatoDiReport[];
}

/** Lettura difensiva della colonna: il contenuto è JSON, non un tipo. */
function leggiRifiuti(
  valore: unknown,
): ImpegnoRifiutatoDiReport["rifiutate"] {
  if (!Array.isArray(valore)) return [];
  const fuori: ImpegnoRifiutatoDiReport["rifiutate"] = [];
  for (const voce of valore) {
    if (typeof voce !== "object" || voce === null) continue;
    const v = voce as Record<string, unknown>;
    if (typeof v.campo !== "string") continue;
    fuori.push({
      campo: v.campo,
      tenuto: typeof v.tenuto === "string" ? v.tenuto : "—",
      rifiutato: typeof v.rifiutato === "string" ? v.rifiutato : "—",
    });
  }
  return fuori;
}

export async function getScorecardSource(): Promise<ScorecardSource> {
  const [rows, excludedReports, startRow, conflitti] = await Promise.all([
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
    /* I report che hanno provato a cambiare l'impegno a settimana aperta.
       Nessun filtro di idoneità: un report escluso dalla scorecard che tenta
       comunque di riscrivere il Weekly Bias Record è anzi il caso che si vuole
       vedere prima. */
    prisma.macroDeskReport.findMany({
      where: { impegnoRifiutato: { not: Prisma.DbNull } },
      orderBy: { reportDate: "desc" },
      take: 20,
      select: { reportDate: true, type: true, impegnoRifiutato: true },
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

  const impegniRifiutati: ImpegnoRifiutatoDiReport[] = conflitti
    .map((riga) => ({
      reportDate: riga.reportDate.toISOString().slice(0, 10),
      tipo: String(riga.type),
      rifiutate: leggiRifiuti(riga.impegnoRifiutato),
    }))
    .filter((s) => s.rifiutate.length > 0);

  return {
    impegniRifiutati,
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
