-- Quota di anni "positivi" su ogni punto del percorso stagionale: senza,
-- il grafico mostrerebbe una media nuda.
--
-- È un ALTER, ma su una tabella creata dalla migrazione 20260803120000 di
-- QUESTO stesso branch: nessuna tabella preesistente dell'applicazione viene
-- toccata. Il DEFAULT 0 rende la colonna sicura anche sulle righe già
-- scritte dal backfill locale, che il job riscrive comunque per intero.
ALTER TABLE "SeasonalityPathPoint" ADD COLUMN "positiveShare" DECIMAL(18,8) NOT NULL DEFAULT 0;
