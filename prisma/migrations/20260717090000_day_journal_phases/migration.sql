-- Journal a 3 fasi (Premarket / In-Market / Post-Market): il journal
-- giornaliero passa da 1 riga per giorno a 1 riga per giorno E fase.

-- CreateEnum
CREATE TYPE "DayPhase" AS ENUM ('PREMARKET', 'INMARKET', 'POSTMARKET');

-- DropIndex
DROP INDEX "Note_userId_dayDate_key";

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "dayPhase" "DayPhase";

-- MIGRAZIONE DATI: le note giornaliere singole già salvate diventano
-- "In-Market" (default ragionevole), così nessun contenuto va perso.
UPDATE "Note" SET "dayPhase" = 'INMARKET' WHERE "type" = 'DAILY' AND "dayPhase" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Note_userId_dayDate_dayPhase_key" ON "Note"("userId", "dayDate", "dayPhase");
