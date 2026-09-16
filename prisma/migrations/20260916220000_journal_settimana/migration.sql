-- Journal di settimana (vista Settimana, 16/09/2026).
-- Solo oggetti NUOVI: la tabella "WeekNote" e il campo nullable
-- "Attachment"."weekNoteId" con indice e chiave esterna. Nessun enum toccato,
-- nessuna riga esistente cambia, il codice già in produzione non li vede.

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "weekNoteId" TEXT;

-- CreateTable
CREATE TABLE "WeekNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeekNote_userId_weekStart_key" ON "WeekNote"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "Attachment_weekNoteId_idx" ON "Attachment"("weekNoteId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_weekNoteId_fkey" FOREIGN KEY ("weekNoteId") REFERENCES "WeekNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekNote" ADD CONSTRAINT "WeekNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
