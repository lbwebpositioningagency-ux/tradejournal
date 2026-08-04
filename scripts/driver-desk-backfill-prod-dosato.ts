/**
 * Backfill del Driver Desk DOSATO — una serie alla volta con pausa fra le
 * chiamate esterne, per non colpire Neon/le fonti esterne a raffica.
 *
 * DA LANCIARE SOLO TU, non dal sandbox dell'agente (DATABASE_URL di
 * produzione non è leggibile da lì per design).
 *
 *   vercel env pull .env.production.local --environment production --yes
 *   npx tsx scripts/driver-desk-backfill-prod-dosato.ts
 *
 * Legge SEMPRE `.env.production.local`, esplicitamente — mai il default
 * `.env` (locale) che `dotenv/config` senza argomenti caricherebbe invece,
 * silenziosamente, se il file esiste nella working directory (esiste:
 * questo repo ne ha uno per il Postgres Docker). Con due file `.env*`
 * presenti, il default di dotenv sceglie in modo implicito e sbagliato:
 * qui la scelta è esplicita e verificabile.
 *
 * Riusa ESATTAMENTE la stessa logica di ingest.ts (runDriverDeskIngest):
 * nessuna riscrittura, solo un ciclo esterno con pausa. Sicuro da
 * interrompere e rilanciare: ogni serie è una transazione atomica a sé
 * (delete + create), mai un residuo misto.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

const ENV_FILE = resolve(__dirname, "..", ".env.production.local");
const loaded = loadEnv({ path: ENV_FILE });
if (loaded.error) {
  console.error(`STOP: impossibile leggere ${ENV_FILE}: ${loaded.error.message}`);
  process.exit(1);
}
console.log(`Variabili caricate da: ${ENV_FILE}`);

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DRIVER_SERIES } from "../src/lib/driver-desk/catalog";
import { runDriverDeskIngest } from "../src/lib/driver-desk/ingest";

const PAUSA_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("neon.tech") && !process.argv.includes("--force-non-neon")) {
    console.error(
      "STOP: DATABASE_URL non sembra puntare a Neon (niente 'neon.tech'). " +
        "Se è voluto, rilancia con --force-non-neon.",
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  console.log(`Driver Desk — backfill DOSATO verso produzione, ${DRIVER_SERIES.length} serie, pausa ${PAUSA_MS}ms fra una e l'altra\n`);

  let ok = true;
  try {
    for (let i = 0; i < DRIVER_SERIES.length; i += 1) {
      const def = DRIVER_SERIES[i];
      const results = await runDriverDeskIngest(prisma, {
        only: [def.code],
        onProgress: (msg) => console.log(`  ${msg}`),
      });
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
      if (i < DRIVER_SERIES.length - 1) {
        console.log(`  … pausa ${PAUSA_MS}ms …\n`);
        await sleep(PAUSA_MS);
      }
    }
    console.log("\nFatto.");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
