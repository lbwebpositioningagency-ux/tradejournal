-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "targetR" DECIMAL(10,4);

-- Backfill del target R sui trade già presenti.
--
-- Stessa definizione di metrics/plan.ts (targetRMultiple):
--   rischio = (entry − stop) per i LONG, (stop − entry) per gli SHORT
--   reward  = (target − entry) per i LONG, (entry − target) per gli SHORT
--   target R = reward / rischio, SOLO se entrambi sono strettamente positivi
--              (stop o target dal lato sbagliato = piano non valido = NULL).
-- Un test di integrazione confronta questo backfill con la funzione TypeScript
-- su tutti i trade del conto demo: le due strade devono coincidere.
UPDATE "Trade" t
SET "targetR" = ROUND(
      (CASE WHEN t."direction" = 'LONG'
            THEN t."plannedTarget" - t."avgEntryPrice"
            ELSE t."avgEntryPrice" - t."plannedTarget" END)
      /
      (CASE WHEN t."direction" = 'LONG'
            THEN t."avgEntryPrice" - t."plannedStop"
            ELSE t."plannedStop" - t."avgEntryPrice" END)
    , 4)
WHERE t."plannedStop" IS NOT NULL
  AND t."plannedTarget" IS NOT NULL
  AND (CASE WHEN t."direction" = 'LONG'
            THEN t."avgEntryPrice" - t."plannedStop"
            ELSE t."plannedStop" - t."avgEntryPrice" END) > 0
  AND (CASE WHEN t."direction" = 'LONG'
            THEN t."plannedTarget" - t."avgEntryPrice"
            ELSE t."avgEntryPrice" - t."plannedTarget" END) > 0;
