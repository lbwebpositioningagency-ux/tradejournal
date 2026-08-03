-- CreateTable
CREATE TABLE "SeasonalityMonthlyObs" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "value" DECIMAL(18,8) NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "SeasonalityMonthlyObs_pkey" PRIMARY KEY ("instrument","year","month")
);
