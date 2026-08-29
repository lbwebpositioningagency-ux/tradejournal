-- REGISTRO DELLE VARIAZIONI della Stagionalità: v. il commento del modello
-- `SeasonalityImpronta` in schema.prisma per il perché una riga nuova nasca
-- solo quando i valori cambiano.
--
-- Tabella NUOVA e vuota: non tocca nessun dato esistente, e se il comando si
-- interrompe a metà non resta niente di parziale — CREATE TABLE e CREATE INDEX
-- sono nella stessa transazione.
CREATE TABLE "SeasonalityImpronta" (
    "id" TEXT NOT NULL,
    "instrument" "SeasonalityInstrument" NOT NULL,
    "lookbackYears" INTEGER NOT NULL,
    "primaVista" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVista" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "digest" TEXT NOT NULL,
    "barre" INTEGER NOT NULL,
    "primaData" DATE,
    "ultimaData" DATE,
    "payload" JSONB NOT NULL,

    CONSTRAINT "SeasonalityImpronta_pkey" PRIMARY KEY ("id")
);

-- L'unica lettura che il giro fa: l'ultima impronta di questa serie e finestra.
CREATE INDEX "SeasonalityImpronta_instrument_lookbackYears_primaVista_idx"
    ON "SeasonalityImpronta"("instrument", "lookbackYears", "primaVista");
