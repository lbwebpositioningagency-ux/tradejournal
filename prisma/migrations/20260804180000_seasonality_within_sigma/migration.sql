-- Copertura empirica della banda media±1σ: quota di osservazioni davvero
-- dentro [media−σ, media+σ]. ADDITIVA, su una tabella del modulo.
ALTER TABLE "SeasonalityStat" ADD COLUMN "withinSigma" DECIMAL(18,8);
