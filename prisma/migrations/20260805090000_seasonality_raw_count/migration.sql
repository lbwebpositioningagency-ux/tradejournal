-- Conteggio delle osservazioni GREZZE (giorni di quotazione, o ore per
-- l'intraday) dietro le medie annue. ADDITIVA, su una tabella del modulo.
ALTER TABLE "SeasonalityStat" ADD COLUMN "rawCount" INTEGER;
