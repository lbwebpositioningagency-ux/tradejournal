-- Modifiche all'impegno della domenica rifiutate dall'endpoint.
-- Colonna ADDITIVA e nullable: i report esistenti restano validi con null,
-- che significa «nessuna discrepanza rilevata».
ALTER TABLE "MacroDeskReport" ADD COLUMN "impegnoRifiutato" JSONB;
