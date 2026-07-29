import { z } from "zod";
import { isValidCalendarDate } from "@/lib/dates";

/**
 * Schema del report Macro Desk ricevuto via API dal sistema esterno.
 * Il bias è String a schema Prisma ma QUI è un enum chiuso: un valore fuori
 * lista è un errore del mittente, non un dato da salvare.
 */

export const MACRO_BIASES = ["RIALZISTA", "RIBASSISTA", "NEUTRALE"] as const;
export type MacroBias = (typeof MACRO_BIASES)[number];

export const MACRO_REPORT_TYPES = ["DAILY", "WEEKLY"] as const;

const bias = z.enum(MACRO_BIASES);

const confidence = z
  .number()
  .int("La confidenza deve essere un intero")
  .min(0, "Confidenza minima 0")
  .max(100, "Confidenza massima 100");

const assetOutlook = z.object({ bias, confidence });

/** "YYYY-MM-DD" che sia una data di calendario REALE (niente rollover V8). */
const reportDateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data del report non valida (atteso YYYY-MM-DD)")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    return isValidCalendarDate(year, month, day);
  }, "Data del report inesistente");

/** ISO UTC con secondi (frazioni opzionali), data di calendario reale. */
const isoUtc = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    "generatedAt non valido (atteso ISO UTC, es. 2026-07-21T06:30:00Z)",
  )
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const hour = Number(value.slice(11, 13));
    const minute = Number(value.slice(14, 16));
    const second = Number(value.slice(17, 19));
    return (
      isValidCalendarDate(year, month, day) &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59
    );
  }, "generatedAt inesistente");

export const macroDeskReportSchema = z.object({
  type: z.enum(MACRO_REPORT_TYPES),
  reportDate: reportDateKey,
  generatedAt: isoUtc,
  assets: z.object({
    xau: assetOutlook,
    wti: assetOutlook,
    idx: assetOutlook,
  }),
  summary: z.string().trim().max(2000, "Sintesi troppo lunga").optional(),
  // Il report completo: qualsiasi JSON, obbligatorio (è il dettaglio in pagina).
  payload: z
    .unknown()
    .refine((v) => v !== undefined && v !== null, "payload obbligatorio"),

  // ───── Campi v2 (scorecard a Expected Move) ─────
  // Tutti OPZIONALI: un report v1 resta valido e non li invia. I blocchi
  // strutturati (`biasRecord`, `resolved`, `monitor`) NON si validano campo
  // per campo qui di proposito — il desk è un sistema esterno che evolve, e
  // rifiutare un report intero per una chiave inattesa perderebbe il dato.
  // Si accettano come JSON, si conservano interi, e la lettura passa da un
  // parser difensivo (src/lib/macro-desk-bias-record.ts) che scarta il
  // malformato e tiene il valido. Stessa scelta già fatta per `payload`.
  schemaVersion: z
    .number()
    .int("schemaVersion deve essere un intero")
    .positive("schemaVersion deve essere positivo")
    .optional(),
  scorecardEligible: z.boolean().optional(),
  trackRecordStart: z.boolean().optional(),
  biasRecord: z.unknown().optional(),
  resolved: z.unknown().optional(),
  monitor: z.unknown().optional(),
});

export type MacroDeskReportInput = z.infer<typeof macroDeskReportSchema>;
