-- CreateEnum
CREATE TYPE "DriverDeskSeries" AS ENUM ('XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'GER40', 'STOXX50E', 'CAC40', 'SPX', 'DFII10', 'T10YIE', 'DTWEXBGS', 'EURUSD', 'BUND10Y');

-- CreateTable
CREATE TABLE "DriverDeskBar" (
    "series" "DriverDeskSeries" NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "DriverDeskBar_pkey" PRIMARY KEY ("series","date")
);

-- CreateTable
CREATE TABLE "DriverDeskCoverage" (
    "series" "DriverDeskSeries" NOT NULL,
    "source" TEXT,
    "firstDate" DATE,
    "lastDate" DATE,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverDeskCoverage_pkey" PRIMARY KEY ("series")
);
