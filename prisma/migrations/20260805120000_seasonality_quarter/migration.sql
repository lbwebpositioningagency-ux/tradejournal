-- Medie stagionali per quarto d'ora, aggregate per anno. Le barre M15 grezze
-- NON vengono conservate: si scaricano, si aggregano e si buttano. ADDITIVA.
CREATE TABLE "SeasonalityQuarterYear" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "clock" "SeasonalityClock" NOT NULL,
    "year" INTEGER NOT NULL,
    "bucket" INTEGER NOT NULL,
    "mean" DECIMAL(18,12) NOT NULL,
    "bars" INTEGER NOT NULL,
    CONSTRAINT "SeasonalityQuarterYear_pkey" PRIMARY KEY ("instrument","clock","year","bucket")
);

ALTER TABLE "SeasonalityJobState" ADD COLUMN "quarterNextYear" INTEGER;
ALTER TABLE "SeasonalityJobState" ADD COLUMN "quarterIngestComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SeasonalityJobState" ADD COLUMN "quarterDoneAt" TIMESTAMP(3);
