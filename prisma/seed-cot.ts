import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseCsvStoricoCot, STRUMENTI_COT } from "../src/lib/cot-sync";

/**
 * Popola UNA VOLTA lo storico COT (tabella CotWeek) dal CSV verificato
 * dati/COT_gold_wti.csv. Idempotente: skipDuplicates, rilanciarlo non crea
 * doppioni e non sovrascrive nulla.
 *
 * Uso:
 *   npx tsx prisma/seed-cot.ts                            # tutto lo storico
 *   npx tsx prisma/seed-cot.ts --escludi-ultima-settimana # tutto TRANNE la
 *     settimana più recente di ogni strumento: serve alla prova del job di
 *     sync, che così ha una settimana vera da scaricare dall'API e inserire.
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

const escludiUltima = process.argv.includes("--escludi-ultima-settimana");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const csv = readFileSync(join(process.cwd(), "dati", "COT_gold_wti.csv"), "utf8");
  let righe = parseCsvStoricoCot(csv);

  if (escludiUltima) {
    for (const strumento of STRUMENTI_COT) {
      const date = righe
        .filter((r) => r.strumento === strumento)
        .map((r) => r.settimana.reportDate);
      const ultima = date.reduce((a, b) => (b > a ? b : a), "");
      righe = righe.filter(
        (r) => !(r.strumento === strumento && r.settimana.reportDate === ultima),
      );
      console.log(`${strumento}: esclusa l'ultima settimana del CSV (${ultima})`);
    }
  }

  const esito = await prisma.cotWeek.createMany({
    data: righe.map((r) => ({
      instrument: r.strumento,
      reportDate: new Date(`${r.settimana.reportDate}T00:00:00Z`),
      openInterest: r.settimana.openInterest,
      mmNet: r.settimana.mmNet,
      prodNet: r.settimana.prodNet,
    })),
    skipDuplicates: true,
  });

  console.log(`Righe nel CSV: ${righe.length} — inserite adesso: ${esito.count} (le altre c'erano già).`);

  for (const strumento of STRUMENTI_COT) {
    const totale = await prisma.cotWeek.count({ where: { instrument: strumento } });
    const ultima = await prisma.cotWeek.findFirst({
      where: { instrument: strumento },
      orderBy: { reportDate: "desc" },
      select: { reportDate: true },
    });
    console.log(
      `${strumento}: ${totale} settimane in tabella, ultima ${ultima?.reportDate.toISOString().slice(0, 10) ?? "—"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
