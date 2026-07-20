-- Sync MetaTrader 5: dedup per conto via brokerTicketId + sorgenti di sync.

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "brokerTicketId" TEXT;

-- CreateTable
CREATE TABLE "Mt5SyncSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradingAccountId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'FOREX',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mt5SyncSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mt5SyncSource_tradingAccountId_key" ON "Mt5SyncSource"("tradingAccountId");

-- CreateIndex
CREATE INDEX "Mt5SyncSource_userId_idx" ON "Mt5SyncSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_tradingAccountId_brokerTicketId_key" ON "Trade"("tradingAccountId", "brokerTicketId");

-- AddForeignKey
ALTER TABLE "Mt5SyncSource" ADD CONSTRAINT "Mt5SyncSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mt5SyncSource" ADD CONSTRAINT "Mt5SyncSource_tradingAccountId_fkey" FOREIGN KEY ("tradingAccountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
