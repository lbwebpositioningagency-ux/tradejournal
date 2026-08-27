-- CreateTable
CREATE TABLE "RadarReport" (
    "id" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "windowFrom" DATE NOT NULL,
    "windowTo" DATE NOT NULL,
    "windowExtended" BOOLEAN NOT NULL DEFAULT false,
    "discarded" INTEGER,
    "notes" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarHighlight" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "whatChanged" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,

    CONSTRAINT "RadarHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarChange" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "whatChanged" TEXT NOT NULL,
    "who" TEXT,
    "announcedOn" DATE,
    "effectiveFrom" DATE,
    "status" TEXT NOT NULL,
    "impact" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "extra" JSONB,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "RadarChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarReading" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "whatChanged" TEXT NOT NULL,
    "impact" TEXT,
    "publishedOn" DATE,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "extra" JSONB,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "RadarReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarWatch" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "area" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "extra" JSONB,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "RadarWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarEmptyArea" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "RadarEmptyArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarUnverifiableArea" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "RadarUnverifiableArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadarReport_weekOf_key" ON "RadarReport"("weekOf");

-- CreateIndex
CREATE INDEX "RadarHighlight_reportId_idx" ON "RadarHighlight"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarHighlight_reportId_ordine_key" ON "RadarHighlight"("reportId", "ordine");

-- CreateIndex
CREATE INDEX "RadarChange_slug_idx" ON "RadarChange"("slug");

-- CreateIndex
CREATE INDEX "RadarChange_reportId_idx" ON "RadarChange"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarChange_reportId_slug_key" ON "RadarChange"("reportId", "slug");

-- CreateIndex
CREATE INDEX "RadarReading_slug_idx" ON "RadarReading"("slug");

-- CreateIndex
CREATE INDEX "RadarReading_reportId_idx" ON "RadarReading"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarReading_reportId_slug_key" ON "RadarReading"("reportId", "slug");

-- CreateIndex
CREATE INDEX "RadarWatch_slug_idx" ON "RadarWatch"("slug");

-- CreateIndex
CREATE INDEX "RadarWatch_reportId_idx" ON "RadarWatch"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarWatch_reportId_slug_key" ON "RadarWatch"("reportId", "slug");

-- CreateIndex
CREATE INDEX "RadarEmptyArea_reportId_idx" ON "RadarEmptyArea"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarEmptyArea_reportId_area_key" ON "RadarEmptyArea"("reportId", "area");

-- CreateIndex
CREATE INDEX "RadarUnverifiableArea_area_idx" ON "RadarUnverifiableArea"("area");

-- CreateIndex
CREATE INDEX "RadarUnverifiableArea_reportId_idx" ON "RadarUnverifiableArea"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarUnverifiableArea_reportId_area_key" ON "RadarUnverifiableArea"("reportId", "area");

-- AddForeignKey
ALTER TABLE "RadarHighlight" ADD CONSTRAINT "RadarHighlight_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RadarReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarChange" ADD CONSTRAINT "RadarChange_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RadarReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarReading" ADD CONSTRAINT "RadarReading_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RadarReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarWatch" ADD CONSTRAINT "RadarWatch_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RadarReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarEmptyArea" ADD CONSTRAINT "RadarEmptyArea_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RadarReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarUnverifiableArea" ADD CONSTRAINT "RadarUnverifiableArea_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RadarReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
