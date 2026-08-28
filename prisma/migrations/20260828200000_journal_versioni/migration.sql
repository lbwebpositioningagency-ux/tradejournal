-- Journal append-only delle versioni di un report Macro Desk.
-- ADDITIVA: nessuna colonna nuova su MacroDeskReport, nessun vincolo nuovo
-- sulle righe esistenti. La chiave unique (type, reportDate) resta intatta.
CREATE TABLE "MacroDeskReportVersione" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "arrivatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "biasRecord" JSONB,
    "monitor" JSONB,
    "rilievi" JSONB,

    CONSTRAINT "MacroDeskReportVersione_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MacroDeskReportVersione_reportId_arrivatoIl_idx"
    ON "MacroDeskReportVersione"("reportId", "arrivatoIl");

ALTER TABLE "MacroDeskReportVersione"
    ADD CONSTRAINT "MacroDeskReportVersione_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "MacroDeskReport"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
