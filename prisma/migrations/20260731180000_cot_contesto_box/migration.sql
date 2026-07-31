-- CreateTable
CREATE TABLE "CotContestoBox" (
    "id" TEXT NOT NULL,
    "settimanaCot" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contenuto" JSONB NOT NULL,

    CONSTRAINT "CotContestoBox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CotContestoBox_settimanaCot_key" ON "CotContestoBox"("settimanaCot");
