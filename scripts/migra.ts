/**
 * APPLICA LE MIGRAZIONI — passo deliberato, fuori dalla build.
 *
 * ── COSA HA SOSTITUITO, E PERCHÉ ─────────────────────────────────────────
 *
 * Fino al 28/08/2026 lo script di build era
 * `prisma generate && prisma migrate deploy && next build`. Due difetti, uno
 * dei quali grave:
 *
 *  1. GRAVE — `DATABASE_URL` su Vercel è **un solo record** con target
 *     `["production","preview"]` (verificato dai metadati: un record, due
 *     ambienti, quindi lo stesso valore). Con `migrate deploy` dentro la
 *     build, **un deploy di anteprima applicava migrazioni al database di
 *     PRODUZIONE**: bastava pushare un branch. Toglierlo dalla build
 *     disinnesca quello, ed è la ragione principale del cambio.
 *  2. Ogni deployment contendeva lo stesso advisory lock di Prisma. Il
 *     28/08/2026 due build a otto minuti di distanza si sono scontrate e la
 *     seconda è morta con `P1002 — Timed out trying to acquire a postgres
 *     advisory lock (SELECT pg_advisory_lock(72707369)). Timeout: 10000ms`.
 *     Lo stesso commit, ricostruito da solo, ha compilato senza toccare una
 *     riga.
 *
 * Non si è scelto di serializzare i deploy: su questo progetto si lavora con
 * più sessioni in parallelo, e una pipeline che ammette un deploy per volta
 * costa più del problema che risolve.
 *
 * ── COME SI USA ──────────────────────────────────────────────────────────
 *
 *   npm run db:deploy                          → sul Postgres locale
 *   ALLOW_REMOTE_DB=1 npm run db:deploy        → su Neon, con l'ambiente di
 *                                                produzione caricato
 *
 * La regola d'ordine è: **prima le migrazioni, poi il push del codice che le
 * presuppone.** È una convenzione, non un meccanismo — la rete che raccoglie
 * gli strappi è il confronto fra migrazioni attese e applicate, esposto da
 * `/api/health/migrazioni` e acceso ogni notte dal dispatcher
 * `/api/seasonality-sync`.
 *
 * ── LA GUARDIA ───────────────────────────────────────────────────────────
 *
 * La connection string passa da `resolveWritableDatabaseUrl`, come impone la
 * regola di progetto per tutto ciò che scrive: `migrate deploy` scrive DDL,
 * quindi è a pieno titolo uno script di scrittura. Su un host non locale
 * muore, a meno di `ALLOW_REMOTE_DB=1` digitato da chi lancia il comando.
 * L'host viene stampato prima di agire, con la password mascherata.
 */

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  maskDatabaseUrl,
  resolveWritableDatabaseUrl,
} from "../src/lib/db-guard";

const SCOPO = "db:deploy";

const url = resolveWritableDatabaseUrl(SCOPO);
console.log(`[${SCOPO}] database di destinazione: ${maskDatabaseUrl(url)}`);

/* La URL risolta dalla guardia viene ripassata esplicitamente al processo
   figlio: `prisma.config.ts` legge `process.env.DATABASE_URL`, e passare per
   la guardia senza poi usarne il risultato sarebbe teatro. */
const ambiente = { ...process.env, DATABASE_URL: url };

/* La CLI di Prisma si invoca col suo entrypoint JS, non via `npx` con
   `shell: true`: la shell su Windows concatena gli argomenti invece di
   passarli (Node lo segnala come DEP0190), e qui non serve a niente. */
const cliPrisma = createRequire(import.meta.url).resolve("prisma/build/index.js");

function prisma(...argomenti: string[]): void {
  execFileSync(process.execPath, [cliPrisma, ...argomenti], {
    stdio: "inherit",
    env: ambiente,
  });
}

prisma("migrate", "deploy");

/* Lo stato finale si STAMPA, non si presume: è la prova di com'è rimasto il
   database dopo il comando, ed è la riga che si incolla nel resoconto. */
console.log(`\n[${SCOPO}] stato dopo l'applicazione:`);
prisma("migrate", "status");
