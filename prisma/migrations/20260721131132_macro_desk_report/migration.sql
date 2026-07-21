-- CreateEnum
CREATE TYPE "MacroReportType" AS ENUM ('DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "MacroDeskReport" (
    "id" TEXT NOT NULL,
    "type" "MacroReportType" NOT NULL,
    "reportDate" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "biasXau" TEXT NOT NULL,
    "biasWti" TEXT NOT NULL,
    "biasIdx" TEXT NOT NULL,
    "confidenceXau" INTEGER NOT NULL,
    "confidenceWti" INTEGER NOT NULL,
    "confidenceIdx" INTEGER NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacroDeskReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MacroDeskReport_type_reportDate_key" ON "MacroDeskReport"("type", "reportDate");
