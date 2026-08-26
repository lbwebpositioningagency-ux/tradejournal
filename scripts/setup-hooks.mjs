/**
 * Punta `core.hooksPath` a `.githooks`, così l'hook di pre-commit vive nel
 * repository ed è lo stesso per chiunque lo cloni — le hook in `.git/hooks`
 * non si versionano e non si propagano.
 *
 * Gira da `npm install` (script `prepare`) e non deve MAI far fallire
 * un'installazione: sui build di Vercel il checkout non ha `.git`, e un
 * `git config` che esplode lì bloccherebbe il deploy per un hook che in
 * quel contesto non serve. Quindi ogni errore è silenzioso e l'uscita è 0.
 *
 * Non basta però che sia questo file a tacere: `.vercelignore` esclude
 * `scripts` dall'upload, quindi su Vercel il file NON ESISTE e `node` muore
 * prima di leggerne una riga — `npm install` esce 1 e il deploy fallisce. È
 * successo il 26/08/2026. Per questo lo script `prepare` in package.json
 * termina con `|| exit 0`: la tolleranza deve stare fuori, nel comando.
 */
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
} catch {
  // Nessun repository git (o git assente): non c'è nulla da installare.
}
