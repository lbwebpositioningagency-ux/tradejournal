-- CreateTable
CREATE TABLE "NotebookNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotebookNote_userId_createdAt_idx" ON "NotebookNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotebookImage_noteId_idx" ON "NotebookImage"("noteId");

-- CreateIndex
CREATE INDEX "NotebookImage_userId_idx" ON "NotebookImage"("userId");

-- AddForeignKey
ALTER TABLE "NotebookNote" ADD CONSTRAINT "NotebookNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookImage" ADD CONSTRAINT "NotebookImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookImage" ADD CONSTRAINT "NotebookImage_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NotebookNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
