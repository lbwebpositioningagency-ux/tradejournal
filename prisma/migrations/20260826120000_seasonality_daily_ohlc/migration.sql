-- OHLC sulle barre giornaliere.
--
-- Colonne NULLABILI di proposito: lo storico gia in tabella non le ha, e
-- riempirlo con la close sarebbe inventare un dato. Restano vuote finche il
-- job non riscrive la serie da una fonte che le fornisce (Dukascopy, Yahoo);
-- per le serie FRED a valore singolo restano vuote per sempre, ed e corretto.
ALTER TABLE "SeasonalityDailyBar"
  ADD COLUMN "open" DECIMAL(18,8),
  ADD COLUMN "high" DECIMAL(18,8),
  ADD COLUMN "low"  DECIMAL(18,8);
