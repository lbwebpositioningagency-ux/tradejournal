-- Radar di settore — il caveat, e l'aggancio dell'evidenza alla voce.
--
-- ADDITIVA: tre colonne nuove, tutte NULLABLE e senza DEFAULT (nessuna
-- riscrittura di tabella, nessun lock lungo), un indice nuovo, e un
-- riempimento che tocca SOLO righe il cui valore era NULL. Nessun DROP,
-- nessuna colonna cambiata di tipo, nessuna tabella fuori dal Radar.

-- AlterTable
ALTER TABLE "RadarChange" ADD COLUMN     "caveat" TEXT;

-- AlterTable
ALTER TABLE "RadarHighlight" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "RadarReading" ADD COLUMN     "caveat" TEXT;

-- CreateIndex
CREATE INDEX "RadarHighlight_slug_idx" ON "RadarHighlight"("slug");

-- ─────────────────────────────────────────────────────────────────────────
-- RIEMPIMENTO DELLO SLUG PER LE RIGHE GIÀ SCRITTE.
--
-- La settimana del collaudo (2026-08-23) è a database con due voci in
-- evidenza scritte prima che `top[]` avesse un `id`: il loro slug è NULL.
-- Senza questo riempimento le loro AZIONI — «Verificare con il broker se
-- NES/NNQ sono già negoziabili…» — non avrebbero più una riga su cui
-- comparire, e sparirebbero dalla pagina nel momento stesso in cui il
-- blocco separato viene tolto. Sarebbe una perdita di dato causata da una
-- revisione della UI, che è esattamente ciò che non deve succedere.
--
-- L'appaiamento usa l'URL della fonte, che è l'unica chiave che quelle
-- righe condividono. È l'appoggio fragile che l'audit ha bocciato per il
-- futuro — e va bene qui, perché non è una regola che resta: è un colpo
-- solo su righe esistenti, che possiamo verificare a occhio (sono due), e
-- da domani l'aggancio arriva dal payload.
--
-- `WHERE slug IS NULL` rende il riempimento idempotente e incapace di
-- toccare qualunque riga scritta col nuovo contratto.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE "RadarHighlight" h
SET "slug" = c."slug"
FROM "RadarChange" c
WHERE c."reportId" = h."reportId"
  AND c."sourceUrl" = h."sourceUrl"
  AND h."slug" IS NULL
  AND h."sourceUrl" IS NOT NULL;

UPDATE "RadarHighlight" h
SET "slug" = r."slug"
FROM "RadarReading" r
WHERE r."reportId" = h."reportId"
  AND r."sourceUrl" = h."sourceUrl"
  AND h."slug" IS NULL
  AND h."sourceUrl" IS NOT NULL;
