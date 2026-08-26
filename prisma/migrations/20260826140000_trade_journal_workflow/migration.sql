-- CreateEnum
CREATE TYPE "TradeNotePhase" AS ENUM ('PLAN', 'REVIEW');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "tradePhase" "TradeNotePhase";

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeChecklistCheck" (
    "tradeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,

    CONSTRAINT "TradeChecklistCheck_pkey" PRIMARY KEY ("tradeId","itemId")
);

-- CreateTable
CREATE TABLE "TradeReview" (
    "tradeId" TEXT NOT NULL,
    "followedPlan" BOOLEAN,
    "whatWorked" TEXT,
    "whatFailed" TEXT,
    "nextTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeReview_pkey" PRIMARY KEY ("tradeId")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_userId_isArchived_idx" ON "ChecklistItem"("userId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_userId_label_key" ON "ChecklistItem"("userId", "label");

-- CreateIndex
CREATE INDEX "TradeChecklistCheck_itemId_idx" ON "TradeChecklistCheck"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_tradeId_tradePhase_key" ON "Note"("tradeId", "tradePhase");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeChecklistCheck" ADD CONSTRAINT "TradeChecklistCheck_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeChecklistCheck" ADD CONSTRAINT "TradeChecklistCheck_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeReview" ADD CONSTRAINT "TradeReview_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

