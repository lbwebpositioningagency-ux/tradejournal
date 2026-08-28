-- Rilievi della sentinella d'ingresso: quel che nel report non rispetta il
-- contratto e che non e' motivo di rifiuto. NULL = report in regola.
ALTER TABLE "MacroDeskReport" ADD COLUMN "rilieviContratto" JSONB;
