import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isLocalDatabaseHost,
  maskDatabaseUrl,
  resolveWritableDatabaseUrl,
} from "../src/lib/db-guard";
import { eseguiJobContestoCot } from "../src/lib/cot-contesto-job";

// dotenv carica solo .env; la GEMINI_API_KEY sta in .env.local (come per il
// dev server Next): la si integra a mano, senza mai stamparla.
if (!process.env.GEMINI_API_KEY) {
  try {
    const envLocal = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const m = envLocal.match(/^GEMINI_API_KEY=(.+)$/m);
    if (m) process.env.GEMINI_API_KEY = m[1].trim();
  } catch {
    // .env.local assente: il job lo segnalerà come "saltato"
  }
}

/**
 * Lancia UNA VOLTA, a mano, la generazione del box di contesto COT — stessa
 * pipeline del cron (ricerca web + DUE cancelli), contro il database di .env.
 *
 * Uso:
 *   npx tsx scripts/cot-contesto-once.ts               # genera E salva
 *   npx tsx scripts/cot-contesto-once.ts --anteprima   # genera, mostra, NON salva
 *
 * Richiede ANTHROPIC_API_KEY nell'ambiente (.env.local va bene).
 */

const url = resolveWritableDatabaseUrl("contesto COT una tantum");
console.log(`Database di destinazione: ${maskDatabaseUrl(url)}`);
console.log(
  isLocalDatabaseHost(new URL(url).hostname)
    ? "(locale)"
    : "(REMOTO — autorizzato da ALLOW_REMOTE_DB=1)",
);

const anteprima = process.argv.includes("--anteprima");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  console.log(anteprima ? "\nModalità ANTEPRIMA: nessuna scrittura.\n" : "");
  console.log("Genero il contesto (ricerca web + cancelli)…\n");
  const { esito, dettaglio } = await eseguiJobContestoCot(prisma, { salva: !anteprima });

  console.log(`Esito: ${esito.esito}${"motivo" in esito ? ` — ${esito.motivo}` : ""}`);
  if (dettaglio?.esito === "pubblicato") {
    console.log("\nContenuto generato (passato da ENTRAMBI i cancelli):\n");
    console.log(JSON.stringify(dettaglio.contenuto, null, 2));
    if (anteprima) console.log("\n(non salvato: rilancia senza --anteprima per salvarlo)");
  }
  if (esito.esito === "scartato") process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
