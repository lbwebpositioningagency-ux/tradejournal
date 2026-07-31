import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { cotSyncDbPrisma, runCotSync, STRUMENTI_COT } from "../src/lib/cot-sync";

/**
 * Lancia UNA VOLTA, a mano, lo stesso job del Vercel Cron (/api/cot-sync),
 * direttamente contro il database di .env — senza server e senza header.
 * Serve a verificare l'automazione prima di aspettare il sabato.
 *
 * Uso:
 *   npx tsx scripts/cot-sync-once.ts
 *
 * È idempotente: rilanciarlo non duplica nulla (al secondo giro dice
 * "gia_aggiornato" con 0 inserite).
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Manca DATABASE_URL.");
  process.exit(1);
}
const target = url.replace(/\/\/[^@]*@/, "//***@");
console.log(`Database di destinazione: ${target}`);
console.log(/localhost|127\.0\.0\.1/.test(url) ? "(locale)" : "(REMOTO — non è il database locale)");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const ETICHETTE: Record<string, string> = {
  aggiornato: "AGGIORNATO",
  gia_aggiornato: "già aggiornato, nessuna settimana nuova",
  contratto_non_trovato: "⚠ CONTRATTO NON TROVATO (probabile rinomina CFTC)",
  errore_rete: "⚠ ERRORE DI RETE",
};

async function main() {
  console.log("\nChiamo l'API CFTC…\n");
  const esito = await runCotSync(cotSyncDbPrisma(prisma));

  for (const s of esito.strumenti) {
    console.log(`── ${s.strumento} (${s.contratto})`);
    console.log(`   ${ETICHETTE[s.esito] ?? s.esito} — settimane inserite: ${s.inserite}`);
    console.log(
      `   ultima settimana in tabella: ${s.ultimaSettimana ?? "—"}` +
        (s.giorniDaUltimaSettimana !== null ? ` (${s.giorniDaUltimaSettimana} giorni fa)` : ""),
    );
    if (s.nonAggiornatoDaGiorni !== null) {
      console.log(`   ⚠ NON AGGIORNATO da ${s.nonAggiornatoDaGiorni} giorni`);
    }
    if (s.dettaglio) console.log(`   dettaglio: ${s.dettaglio}`);
  }

  console.log("\nUltime 3 settimane per strumento, direttamente dalla tabella:");
  for (const strumento of STRUMENTI_COT) {
    const righe = await prisma.cotWeek.findMany({
      where: { instrument: strumento },
      orderBy: { reportDate: "desc" },
      take: 3,
    });
    for (const r of righe) {
      console.log(
        `   ${strumento}  ${r.reportDate.toISOString().slice(0, 10)}  OI ${r.openInterest}  mm_net ${r.mmNet}  prod_net ${r.prodNet}`,
      );
    }
  }

  console.log(`\nEsito complessivo: ${esito.ok ? "OK" : "PROBLEMA (vedi sopra)"}`);
  if (!esito.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
