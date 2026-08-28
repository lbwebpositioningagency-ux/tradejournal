/**
 * Legge dal database quali migrazioni risultano applicate, e le confronta con
 * quelle che il codice deployato si aspetta.
 *
 * Le attese arrivano da `src/generated/migrazioni-attese.json`, fotografato
 * al momento della build da `scripts/genera-migrazioni-attese.mjs`: la
 * cartella `prisma/migrations` non finisce nel bundle serverless, quindi a
 * runtime non è leggibile.
 *
 * `_prisma_migrations` è la tabella di servizio di Prisma. Si legge in SQL
 * grezzo perché non è nello schema e quindi non ha un modello generato.
 */

import { Prisma } from "@/generated/prisma/client";
import migrazioniAttese from "@/generated/migrazioni-attese.json";
import { prisma } from "@/lib/db";
import { confrontaMigrazioni, type ConfrontoMigrazioni } from "@/lib/migrazioni";

interface RigaMigrazione {
  migration_name: string;
}

/**
 * Applicata = ha una `finished_at` E non è stata annullata. Una migrazione
 * iniziata e mai finita, o annullata con `migrate resolve --rolled-back`,
 * NON conta come applicata: contarla darebbe un verde su uno schema che non
 * ha davvero quelle colonne, che è esattamente il guasto da intercettare.
 */
export async function verificaMigrazioni(): Promise<ConfrontoMigrazioni> {
  const righe = await prisma.$queryRaw<RigaMigrazione[]>(Prisma.sql`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  `);

  return confrontaMigrazioni(
    migrazioniAttese.migrazioni,
    righe.map((r) => r.migration_name),
  );
}
