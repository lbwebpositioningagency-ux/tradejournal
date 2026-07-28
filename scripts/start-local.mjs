/**
 * Avvia la build di PRODUZIONE contro il database LOCALE.
 *
 * Perché serve: `next start` gira con NODE_ENV=production e quindi carica
 * anche `.env.production.local` — che in questo repo è il file scaricato da
 * Vercel, con le credenziali del database di PRODUZIONE (Neon). Verificare
 * una fase su quel database sarebbe, nella migliore delle ipotesi, inutile;
 * nella peggiore, dannoso.
 *
 * Le variabili già presenti in `process.env` hanno la precedenza sui file
 * `.env` di Next: qui si legge `.env` (locale) PRIMA e si passa tutto al
 * processo figlio, così il puntamento al DB locale vince sempre. Nessun file
 * da spostare a mano e da ricordarsi di rimettere a posto.
 */
import { spawn } from "node:child_process";
import { config } from "dotenv";

const { parsed } = config({ path: ".env" });

if (!parsed?.DATABASE_URL) {
  console.error("Manca DATABASE_URL in .env: impossibile partire in locale.");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(parsed.DATABASE_URL)) {
  console.error(
    "Il DATABASE_URL di .env non punta a localhost: mi fermo per sicurezza.",
  );
  process.exit(1);
}

const port = process.env.PORT ?? "3100";
console.log(`Avvio build di produzione su :${port} col database LOCALE.`);

const child = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...parsed },
});
child.on("exit", (code) => process.exit(code ?? 0));
