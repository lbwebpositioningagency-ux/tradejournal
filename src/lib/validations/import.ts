import { z } from "zod";
import { CSV_DATE_FORMATS, IMPORT_TARGET_FIELDS } from "@/lib/csv-import";
import { ASSET_CLASSES } from "@/lib/constants";

/** Contenuto del campo Json `ImportProfile.mapping`. */
export const importProfileMappingSchema = z.object({
  columns: z.partialRecord(z.enum(IMPORT_TARGET_FIELDS), z.string().min(1)),
  dateFormat: z.enum(CSV_DATE_FORMATS),
  options: z.object({
    assetClass: z.enum(ASSET_CLASSES),
    pointValue: z
      .string()
      .trim()
      .regex(/^\d+([.,]\d{1,8})?$/, "Valore punto non valido")
      .transform((v) => v.replace(",", ".")),
  }),
});

export const importProfileSchema = z.object({
  name: z.string().trim().min(1, "Nome obbligatorio").max(60, "Nome troppo lungo"),
  mapping: importProfileMappingSchema,
});

export type ImportProfileMapping = z.infer<typeof importProfileMappingSchema>;
export type ImportProfileInput = z.infer<typeof importProfileSchema>;
