import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type {
  ScorecardReportRow,
  ScorecardReportType,
} from "@/lib/macro-desk-scorecard";

/**
 * Righe per la scorecard: bias/confidence dalle colonne, prezzi estratti in
 * SQL dalla riga di payload.history con date = reportDate (LATERAL sul JSONB).
 * I payload interi (decine di KB l'uno) non lasciano mai il database: in JS
 * arrivano id, bias e tre prezzi per report — la riduzione pesante sta qui,
 * la risoluzione delle coppie nel modulo puro.
 *
 * I numerici JSON arrivano come ::text (stringhe decimali), convenzione del
 * progetto; report senza history o senza riga del giorno → prezzi null.
 */

interface RawRow {
  id: string;
  type: ScorecardReportType;
  dateKey: string;
  biasXau: string;
  biasWti: string;
  biasIdx: string;
  confidenceXau: number;
  confidenceWti: number;
  confidenceIdx: number;
  xauPx: string | null;
  wtiPx: string | null;
  idxPx: string | null;
}

export async function getMacroScorecardRows(): Promise<ScorecardReportRow[]> {
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      r."id",
      r."type"::text                          AS "type",
      to_char(r."reportDate", 'YYYY-MM-DD')   AS "dateKey",
      r."biasXau", r."biasWti", r."biasIdx",
      r."confidenceXau", r."confidenceWti", r."confidenceIdx",
      h."row"->>'xauPx'                       AS "xauPx",
      h."row"->>'wtiPx'                       AS "wtiPx",
      h."row"->>'idxPx'                       AS "idxPx"
    FROM "MacroDeskReport" r
    LEFT JOIN LATERAL (
      SELECT value AS "row"
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(r."payload"->'history') = 'array'
             THEN r."payload"->'history'
             ELSE '[]'::jsonb END
      ) AS value
      WHERE value->>'date' = to_char(r."reportDate", 'YYYY-MM-DD')
      LIMIT 1
    ) h ON true
    ORDER BY r."reportDate" ASC, r."type" ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    dateKey: row.dateKey,
    bias: { xau: row.biasXau, wti: row.biasWti, idx: row.biasIdx },
    confidence: {
      xau: row.confidenceXau,
      wti: row.confidenceWti,
      idx: row.confidenceIdx,
    },
    price: { xau: row.xauPx, wti: row.wtiPx, idx: row.idxPx },
  }));
}
