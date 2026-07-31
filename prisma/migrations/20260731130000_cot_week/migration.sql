-- CreateEnum
CREATE TYPE "CotInstrument" AS ENUM ('GOLD', 'WTI');

-- CreateTable
CREATE TABLE "CotWeek" (
    "id" TEXT NOT NULL,
    "instrument" "CotInstrument" NOT NULL,
    "reportDate" DATE NOT NULL,
    "openInterest" INTEGER NOT NULL,
    "mmNet" INTEGER NOT NULL,
    "prodNet" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CotWeek_instrument_reportDate_key" ON "CotWeek"("instrument", "reportDate");
