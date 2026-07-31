import { z } from "zod";
import { ASSET_CLASSES } from "@/lib/constants";

/** Sorgente di sync MT5: un file NDJSON per conto di trading. */
export const mt5SourceSchema = z.object({
  tradingAccountId: z.string().min(1, "Seleziona un conto"),
  filePath: z
    .string()
    .trim()
    .min(3, "Percorso del file obbligatorio")
    .max(500, "Percorso troppo lungo")
    .refine(
      (p) => p.toLowerCase().endsWith(".ndjson") || p.toLowerCase().endsWith(".jsonl") || p.toLowerCase().endsWith(".json") || p.toLowerCase().endsWith(".txt"),
      "Il file deve essere .ndjson/.jsonl/.json/.txt",
    ),
  assetClass: z.enum(ASSET_CLASSES).default("FOREX"),
  enabled: z.boolean().default(true),
});

export type Mt5SourceInput = z.input<typeof mt5SourceSchema>;

/** Esito dell'ultimo sync salvato dal watcher (letto in modo difensivo). */
export const mt5LastResultSchema = z
  .object({
    imported: z.number().int().optional(),
    duplicates: z.number().int().optional(),
    malformed: z.array(z.object({ line: z.number(), error: z.string() })).optional(),
    failed: z.array(z.object({ row: z.number(), error: z.string() })).optional(),
    divergences: z
      .array(
        z.object({
          row: z.number(),
          brokerTicketId: z.string(),
          computedNet: z.string(),
          brokerProfit: z.string(),
        }),
      )
      .optional(),
    partialTail: z.boolean().optional(),
    error: z.string().optional(),
  })
  .partial();

export type Mt5LastResult = z.infer<typeof mt5LastResultSchema>;

export function parseMt5LastResult(raw: unknown): Mt5LastResult | null {
  if (raw === null || raw === undefined) return null;
  const parsed = mt5LastResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
