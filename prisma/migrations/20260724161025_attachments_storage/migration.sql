/*
  Warnings:

  - Added the required column `data` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Attachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "data" BYTEA NOT NULL,
ADD COLUMN     "dayDate" DATE,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Attachment_userId_dayDate_idx" ON "Attachment"("userId", "dayDate");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
