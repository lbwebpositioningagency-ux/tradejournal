-- AlterTable
ALTER TABLE "MacroDeskReport" ADD COLUMN     "biasRecord" JSONB,
ADD COLUMN     "monitor" JSONB,
ADD COLUMN     "resolved" JSONB,
ADD COLUMN     "schemaVersion" INTEGER,
ADD COLUMN     "scorecardEligible" BOOLEAN,
ADD COLUMN     "trackRecordStart" BOOLEAN NOT NULL DEFAULT false;
