-- Progress Tracker, fase 1: regole di disciplina. Solo tabelle NUOVE: nessuna
-- tabella esistente (User, TradingAccount, Trade) viene modificata.

-- CreateEnum
CREATE TYPE "DisciplineRuleType" AS ENUM ('STOP_PRESENT', 'STOP_RESPECTED', 'MAX_LOSS_PER_TRADE', 'MAX_DAILY_LOSS', 'MAX_TRADES_PER_DAY', 'MAX_PLANNED_RISK', 'MIN_TARGET_R', 'TRADING_HOURS', 'COOLDOWN_AFTER_LOSS', 'MAX_CONSECUTIVE_LOSSES', 'MAX_OPEN_POSITIONS', 'MAX_QUANTITY_PER_SYMBOL');

-- CreateTable
CREATE TABLE "DisciplineRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DisciplineRuleType" NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "rValue" DECIMAL(10,4),
    "countValue" INTEGER,
    "minutesValue" INTEGER,
    "sessions" TEXT[],
    "allowWeekend" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineRuleCurrencyLimit" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "DisciplineRuleCurrencyLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineRuleSymbolLimit" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "DisciplineRuleSymbolLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineRule_userId_type_key" ON "DisciplineRule"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineRuleCurrencyLimit_ruleId_currency_key" ON "DisciplineRuleCurrencyLimit"("ruleId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineRuleSymbolLimit_ruleId_symbol_key" ON "DisciplineRuleSymbolLimit"("ruleId", "symbol");

-- AddForeignKey
ALTER TABLE "DisciplineRule" ADD CONSTRAINT "DisciplineRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineRuleCurrencyLimit" ADD CONSTRAINT "DisciplineRuleCurrencyLimit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DisciplineRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineRuleSymbolLimit" ADD CONSTRAINT "DisciplineRuleSymbolLimit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DisciplineRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

