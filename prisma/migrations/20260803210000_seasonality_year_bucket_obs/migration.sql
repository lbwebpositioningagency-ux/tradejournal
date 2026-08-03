-- Osservazioni per (strumento, granularità, orologio, anno, bucket): alimentano
-- le heatmap anni × mesi / settimane / giorni / sessioni / ore.
--
-- L'orologio serve alla sola granularità HOUR, che esiste in due versioni
-- precalcolate (UTC e ora italiana): il toggle in pagina cambia riga, non
-- rietichetta — tra CET e CEST lo scarto cambia dentro l'anno.
--
-- Puramente ADDITIVA: una CREATE TABLE, nessun ALTER e nessun DROP.
CREATE TABLE "SeasonalityYearBucketObs" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "granularity" "SeasonalityGranularity" NOT NULL,
    "clock" "SeasonalityClock" NOT NULL DEFAULT 'ROME',
    "year" INTEGER NOT NULL,
    "bucket" INTEGER NOT NULL,
    "value" DECIMAL(18,8) NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "SeasonalityYearBucketObs_pkey" PRIMARY KEY ("instrument","granularity","clock","year","bucket")
);
