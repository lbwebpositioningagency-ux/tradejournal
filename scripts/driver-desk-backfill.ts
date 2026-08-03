/**
 * Popolamento del Driver Desk (chiusure giornaliere di tutte le serie).
 *
 *   npx tsx scripts/driver-desk-backfill.ts                 # tutte le serie
 *   npx tsx scripts/driver-desk-backfill.ts XAUUSD BUND10Y  # solo alcune
 *
 * Gira in LOCALE contro il database indicato da DATABASE_URL. È ripetibile:
 * le scritture sostituiscono integralmente la serie, rilanciarlo non duplica.
 * Non tocca nessuna tabella dell'applicazione.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runDriverDeskIngest } from "../src/lib/driver-desk/ingest";

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log(
    only.length > 0
      ? `Driver Desk — ingest di: ${only.join(", ")}`
      : "Driver Desk — ingest di tutte le serie",
  );

  try {
    const results = await runDriverDeskIngest(prisma, {
      only: only.length > 0 ? only : undefined,
      onProgress: (msg) => console.log(`  ${msg}`),
    });

    console.log("");
    let ok = true;
    for (const r of results) {
      if (r.ok) {
        console.log(
          `${r.series.padEnd(9)} OK    ${String(r.rows).padStart(6)} righe  ${r.firstDate} → ${r.lastDate}  [${r.source}]`,
        );
      } else {
        ok = false;
        console.log(`${r.series.padEnd(9)} ERRORE  ${r.error}`);
      }
      for (const f of r.qa) {
        console.log(`          QA ${f.kind.toUpperCase()}: ${f.detail}`);
      }
    }
    process.exitCode = ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
