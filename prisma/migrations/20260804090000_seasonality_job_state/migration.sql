-- Cursore di ripresa del job (rende il primo caricamento convergente) e nota
-- di copertura oraria separata da quella d'errore.
--
-- ADDITIVA: una CREATE TABLE e una ADD COLUMN su una tabella creata da questo
-- stesso branch. Nessuna tabella preesistente dell'applicazione è toccata.
CREATE TABLE "SeasonalityJobState" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "dailyDoneAt" TIMESTAMP(3),
    "hourNextYear" INTEGER,
    "hourIngestComplete" BOOLEAN NOT NULL DEFAULT false,
    "hourRowsAtCompute" INTEGER NOT NULL DEFAULT 0,
    "hourComputedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalityJobState_pkey" PRIMARY KEY ("instrument")
);

ALTER TABLE "SeasonalityCoverage" ADD COLUMN "hourNote" TEXT;
