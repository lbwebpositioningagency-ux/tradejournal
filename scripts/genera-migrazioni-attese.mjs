/**
 * Genera l'elenco delle migrazioni che il CODICE si aspetta.
 *
 * ── PERCHÉ UN FILE GENERATO E NON UNA LETTURA A RUNTIME ──────────────────
 *
 * `prisma/migrations` non finisce nel bundle serverless: in produzione l'app
 * non può leggere quella cartella. L'elenco va quindi fotografato al momento
 * della build, quando la cartella c'è, e portato dentro il bundle come dato.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────
 *
 * Dal 28/08/2026 `prisma migrate deploy` NON sta più nella build: le
 * migrazioni sono un passo deliberato (`npm run db:deploy`). Il beneficio è
 * che un deploy di ANTEPRIMA non può più applicare migrazioni al database di
 * produzione — `DATABASE_URL` è un solo record Vercel con target
 * `["production","preview"]`, quindi finché il comando stava nella build
 * bastava pushare un branch per toccare lo schema di produzione.
 *
 * Il rischio che si introduce è l'opposto: codice in produzione che
 * presuppone una migrazione mai applicata. Questo file è il primo pezzo della
 * rete che lo intercetta; gli altri sono `src/lib/migrazioni.ts` (confronto
 * puro), `src/lib/queries/migrazioni.ts` (che legge `_prisma_migrations`) e i
 * due punti in cui l'esito si accende: `/api/health/migrazioni` e il
 * dispatcher `/api/seasonality-sync`.
 *
 * Nessun campo variabile nell'output (niente data di generazione): a parità di
 * cartella il file è identico, così due build consecutive non producono
 * differenze fantasma.
 *
 * Gira in `postinstall` E in `build`, come il client Prisma: senza, un
 * `npm run typecheck` su un albero appena clonato fallirebbe per un import
 * che punta a un file non ancora generato.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const radice = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cartellaMigrazioni = join(radice, "prisma", "migrations");
const destinazione = join(radice, "src", "generated", "migrazioni-attese.json");

if (!existsSync(cartellaMigrazioni)) {
  throw new Error(
    `[migrazioni-attese] cartella non trovata: ${cartellaMigrazioni}. ` +
      "Senza non si può sapere quali migrazioni il codice si aspetta, e " +
      "generare un elenco vuoto significherebbe dichiarare che va tutto bene.",
  );
}

/* Ordine alfabetico = ordine cronologico: i nomi Prisma iniziano col
   timestamp. L'ordinamento è esplicito e non affidato a `readdir`. */
const migrazioni = readdirSync(cartellaMigrazioni, { withFileTypes: true })
  .filter((voce) => voce.isDirectory())
  .map((voce) => voce.name)
  .sort();

if (migrazioni.length === 0) {
  throw new Error(
    "[migrazioni-attese] nessuna migrazione trovata in prisma/migrations: " +
      "un elenco vuoto renderebbe il controllo cieco invece che verde.",
  );
}

mkdirSync(dirname(destinazione), { recursive: true });
writeFileSync(destinazione, `${JSON.stringify({ migrazioni }, null, 2)}\n`);

console.log(
  `[migrazioni-attese] ${migrazioni.length} migrazioni · ultima ${migrazioni[migrazioni.length - 1]}`,
);
