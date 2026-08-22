/**
 * Primo popolamento della Stagionalità (barre giornaliere + statistiche).
 *
 *   npx tsx scripts/seasonality-backfill.ts               # tutto
 *   npx tsx scripts/seasonality-backfill.ts XAUUSD VIX    # solo alcuni
 *   npx tsx scripts/seasonality-backfill.ts --no-intraday # solo giornaliero
 *   npx tsx scripts/seasonality-backfill.ts --rescan      # ripassa tutte le ore
 *   npx tsx scripts/seasonality-backfill.ts --budget 20000 # SIMULA il limite
 *       di produzione: budget di 20s per esecuzione, e rilancia fino a
 *       convergenza. Serve a dimostrare che il cold-start converge davvero.
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
import { guardedPgAdapter } from "../src/lib/db-guard";
import { runSeasonalityDailyJob } from "../src/lib/seasonality/job";

async function main() {
  const argv = process.argv.slice(2);

  /* In locale non c'è limite di funzione: budget largo. Il flag --budget
     serve a SIMULARE il vincolo di produzione e verificare che più
     esecuzioni convergano davvero. */
  const iBudget = argv.indexOf("--budget");
  const budgetMs = iBudget >= 0 ? Number(argv[iBudget + 1]) : 30 * 60_000;
  const maxGiri = iBudget >= 0 ? 40 : 1;

  /* Gli strumenti sono gli argomenti liberi: vanno tolti i flag E il valore
     che segue --budget, altrimenti "20000" viene preso per un ticker e il
     job non trova niente da fare. */
  const only = argv.filter(
    (a, i) => !a.startsWith("-") && !(iBudget >= 0 && i === iBudget + 1),
  );

  const adapter = guardedPgAdapter("backfill stagionalità");
  const prisma = new PrismaClient({ adapter });

  console.log(
    only.length > 0
      ? `Stagionalità — backfill di: ${only.join(", ")}`
      : "Stagionalità — backfill di tutti gli strumenti",
  );
  console.log(`budget per esecuzione: ${Math.round(budgetMs / 1000)}s · giri max: ${maxGiri}
`);

  try {
    let giro = 0;
    let esito;
    do {
      giro += 1;
      if (maxGiri > 1) console.log(`── giro ${giro} ──`);
      esito = await runSeasonalityDailyJob(prisma, {
        only: only.length > 0 ? only : undefined,
        intraday: !argv.includes("--no-intraday"),
        fullRescan: argv.includes("--rescan") && giro === 1,
        /* Solo al primo giro: forzare il giornaliero a OGNI giro
           impedirebbe per costruzione la convergenza, perché il budget
           verrebbe consumato ogni volta dalla stessa fase. */
        forceDaily: argv.includes("--force-daily") && giro === 1,
        budgetMs,
        onProgress: (msg) => console.log(msg),
      });
      if (maxGiri > 1) {
        console.log(
          `   fase ${esito.fase} · ${Math.round(esito.durataMs / 1000)}s · ${esito.completo ? "COMPLETO" : `prossimo: ${esito.prossimo}`}
`,
        );
      }
    } while (!esito.completo && giro < maxGiri);

    console.log("");
    for (const s of esito.strumenti) {
      const testa = `${s.strumento.padEnd(7)} ${s.esito.padEnd(14)}`;
      if (s.esito === "aggiornato" || s.esito === "gia_aggiornato") {
        console.log(
          `${testa} ${String(s.barre).padStart(6)} barre  ` +
            `${String(s.statistiche).padStart(5)} stat  ` +
            `${s.primaData} → ${s.ultimaData}  [${s.fonte}]`,
        );
        if (s.intraday) {
          console.log(
            `        intraday: ${String(s.intraday.totali).padStart(7)} ore  ` +
              `ingest ${s.intraday.ingestCompleto ? "completo" : `fino al ${s.intraday.prossimoAnno}`}  ` +
              `precalcolo ${s.intraday.precalcolato ? "aggiornato" : "da fare"}` +
              (s.intraday.buchi.length > 0 ? `  · buchi: ${s.intraday.buchi.join(", ")}` : ""),
          );
        }
      } else {
        console.log(`${testa} ${s.messaggio ?? ""}`);
      }
    }
    console.log("");
    console.log(
      `Esito: ${esito.ok ? "OK" : "CON ERRORI"} · ${esito.completo ? "COMPLETO" : `INCOMPLETO → ${esito.prossimo}`} · ${giro} giri · run ${esito.runId}`,
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
