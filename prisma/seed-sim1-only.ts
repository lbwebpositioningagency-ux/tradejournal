import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedSim1 } from "./seed-sim1";
import { DEMO_ACCOUNT_NAME, DEMO_USER_EMAIL } from "../src/lib/constants";

/**
 * Semina SOLO il conto demo globale SIM1 — nient'altro.
 *
 * Perché esiste separato da `prisma/seed.ts`: quello è il seed di SVILUPPO e
 * fa molto di più — cancella e ricrea i trade dell'utente demo, crea conti di
 * esempio. Su un database di PRODUZIONE non deve girare. Questo entry point
 * invece tocca esclusivamente:
 *   - l'utente di sistema che possiede SIM1 (upsert, nessun login possibile);
 *   - il conto SIM1 (upsert su id fisso);
 *   - le strategie e i tag di QUELL'utente (upsert per nome);
 *   - i trade del solo conto SIM1 (cancellati e ricreati con id stabili).
 * Nessuna riga di altri utenti viene letta o modificata.
 *
 * È idempotente: rilanciarlo riporta SIM1 allo stato noto, senza doppioni.
 *
 * Uso:
 *   npm run db:seed:sim1                          # database di .env (locale)
 *   DATABASE_URL="postgres://…" npm run db:seed:sim1   # altro database
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Manca DATABASE_URL.");
  process.exit(1);
}

const target = url.replace(/\/\/[^@]*@/, "//***@");
const isLocal = /localhost|127\.0\.0\.1/.test(url);
console.log(`Database di destinazione: ${target}`);
console.log(isLocal ? "(locale)" : "(REMOTO — non è il database locale)");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const before = await prisma.trade.count();
  const result = await seedSim1(prisma, DEMO_USER_EMAIL, DEMO_ACCOUNT_NAME);
  const after = await prisma.trade.count();

  console.log(
    `${DEMO_ACCOUNT_NAME}: ${result.closed} trade chiusi + ${result.open} aperti — net ${result.netPnl} USD`,
  );
  console.log(
    `Trade totali nel database: ${before} → ${after} (differenza ${after - before}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
