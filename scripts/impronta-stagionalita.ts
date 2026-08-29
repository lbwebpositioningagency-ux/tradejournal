import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isLocalDatabaseHost,
  maskDatabaseUrl,
  resolveWritableDatabaseUrl,
} from "../src/lib/db-guard";
import {
  AVAILABLE_INSTRUMENTS,
  LOOKBACK_YEARS,
} from "../src/lib/seasonality/instruments";
import { registraImpronta } from "../src/lib/seasonality/impronta-store";

/**
 * PRENDE L'IMPRONTA della Stagionalità adesso, senza aspettare il cron.
 *
 * È lo stesso passo che gira in coda a `/api/seasonality-sync`: rilegge dal
 * database i valori che la pagina mostrerà — barre, estremi delle date, `n` e
 * media di ogni mese, cumulato di fine anno — e scrive una riga nel registro
 * SOLO se sono cambiati rispetto all'ultima volta.
 *
 * Serve in due momenti: subito dopo il deploy, per posare la prima pietra di
 * paragone senza attendere la notte; e dopo una riparazione manuale, per
 * registrare che i numeri sono cambiati e perché.
 *
 * Uso:
 *   npx tsx scripts/impronta-stagionalita.ts
 *
 * È idempotente: al secondo giro non scrive niente e lo dice.
 */

const url = resolveWritableDatabaseUrl("impronta della Stagionalità");
console.log(`Database di destinazione: ${maskDatabaseUrl(url)}`);
console.log(
  isLocalDatabaseHost(new URL(url).hostname)
    ? "(locale)"
    : "(REMOTO — autorizzato da ALLOW_REMOTE_DB=1)",
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

async function main() {
  const adesso = new Date();
  let cambiate = 0;
  let nuove = 0;

  for (const def of AVAILABLE_INSTRUMENTS) {
    const esito = await registraImpronta(
      prisma,
      def.code,
      LOOKBACK_YEARS,
      adesso,
    );
    if (esito.primaVolta) {
      nuove += 1;
      console.log(`── ${def.code}: prima impronta, niente con cui confrontare`);
      continue;
    }
    if (!esito.cambiata) {
      console.log(`── ${def.code}: invariata`);
      continue;
    }
    cambiate += 1;
    console.log(
      `── ${def.code}: CAMBIATA` +
        (esito.precedenteDal
          ? ` (il valore precedente reggeva dal ${esito.precedenteDal.toISOString().slice(0, 16).replace("T", " ")})`
          : ""),
    );
    for (const v of esito.variazioni) {
      console.log(`     ${v.gravita === "sospetta" ? "⚠" : " "} ${v.testo}`);
    }
  }

  console.log(
    `\n${nuove} prime impronte · ${cambiate} serie cambiate · ` +
      `${AVAILABLE_INSTRUMENTS.length - nuove - cambiate} invariate`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
