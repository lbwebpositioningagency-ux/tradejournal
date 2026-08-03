/**
 * Primo popolamento della Stagionalità (barre giornaliere + statistiche).
 *
 *   npx tsx scripts/seasonality-backfill.ts            # tutti gli strumenti
 *   npx tsx scripts/seasonality-backfill.ts XAUUSD VIX # solo alcuni
 *
 * Gira in LOCALE contro il database indicato da DATABASE_URL. Non è il cron:
 * il cron notturno fa lo stesso lavoro ma su una serie già presente, e ci sta
 * dentro i 300 secondi di una funzione. Il primo caricamento scarica
 * vent'anni di storia da tre fonti diverse e va lanciato a mano una volta.
 *
 * È ripetibile: le scritture sostituiscono integralmente la serie di ogni
 * strumento, quindi rilanciarlo non duplica niente.
 *
 * NON tocca nessuna tabella dell'applicazione. In particolare non ha niente a
 * che vedere con `db:seed`, che va lasciato in pace.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runSeasonalityDailyJob } from "../src/lib/seasonality/job";

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log(
    only.length > 0
      ? `Stagionalità — backfill di: ${only.join(", ")}`
      : "Stagionalità — backfill di tutti gli strumenti",
  );

  try {
    const esito = await runSeasonalityDailyJob(prisma, {
      only: only.length > 0 ? only : undefined,
    });

    console.log("");
    for (const s of esito.strumenti) {
      const testa = `${s.strumento.padEnd(7)} ${s.esito.padEnd(12)}`;
      if (s.esito === "aggiornato") {
        console.log(
          `${testa} ${String(s.barre).padStart(6)} barre  ` +
            `${String(s.statistiche).padStart(5)} stat  ` +
            `${String(s.puntiPercorso).padStart(5)} punti  ` +
            `${s.primaData} → ${s.ultimaData}  (${s.anniCompleti} anni completi)  ` +
            `[${s.fonte}]`,
        );
      } else {
        console.log(`${testa} ${s.messaggio ?? ""}`);
      }
    }
    console.log("");
    console.log(
      `Esito complessivo: ${esito.ok ? "OK" : "CON ERRORI"} · ${Math.round(esito.durataMs / 1000)}s · run ${esito.runId}`,
    );
    process.exitCode = esito.ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
