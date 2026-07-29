-- Rimozione della funzionalità "Prop Firm Rules" (Fase 17).
--
-- OPERAZIONE DISTRUTTIVA, autorizzata esplicitamente. Prima di eseguirla è
-- stato verificato il contenuto reale delle colonne in produzione: l'unico
-- conto con valori era SIM1, il conto DEMO globale, popolato da un seed che
-- non genera più queste regole. Il conto dell'utente aveva tutti null.
--
-- Nessun codice applicativo legge o scrive queste colonne dalla Fase 17.

ALTER TABLE "TradingAccount"
  DROP COLUMN "propDailyLossLimit",
  DROP COLUMN "propMaxDrawdown",
  DROP COLUMN "propDrawdownType",
  DROP COLUMN "propProfitTarget",
  DROP COLUMN "propMinTradingDays";

-- L'enum esisteva solo per la colonna appena rimossa.
DROP TYPE "PropDrawdownType";
