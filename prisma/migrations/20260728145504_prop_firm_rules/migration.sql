-- CreateEnum
CREATE TYPE "PropDrawdownType" AS ENUM ('STATIC', 'TRAILING');

-- AlterTable
ALTER TABLE "TradingAccount" ADD COLUMN     "propDailyLossLimit" DECIMAL(14,2),
ADD COLUMN     "propDrawdownType" "PropDrawdownType",
ADD COLUMN     "propMaxDrawdown" DECIMAL(14,2),
ADD COLUMN     "propMinTradingDays" INTEGER,
ADD COLUMN     "propProfitTarget" DECIMAL(14,2);
