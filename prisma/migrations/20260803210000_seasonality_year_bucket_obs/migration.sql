-- Osservazioni per (strumento, granularità, anno, bucket): alimentano le
-- heatmap anni × mesi / settimane / giorni.
--
-- Puramente ADDITIVA: una CREATE TABLE, nessun ALTER e nessun DROP. La
-- vecchia "SeasonalityMonthlyObs" resta in piedi ma non è più letta né
-- scritta; una migrazione di pulizia dedicata potrà rimuoverla.
CREATE TABLE "SeasonalityYearBucketObs" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "granularity" "SeasonalityGranularity" NOT NULL,
    "year" INTEGER NOT NULL,
    "bucket" INTEGER NOT NULL,
    "value" DECIMAL(18,8) NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "SeasonalityYearBucketObs_pkey" PRIMARY KEY ("instrument","granularity","year","bucket")
);
