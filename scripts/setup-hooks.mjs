/**
 * Punta `core.hooksPath` a `.githooks`, così l'hook di pre-commit vive nel
 * repository ed è lo stesso per chiunque lo cloni — le hook in `.git/hooks`
 * non si versionano e non si propagano.
 *
 * Gira da `npm install` (script `prepare`) e non deve MAI far fallire
 * un'installazione: sui build di Vercel il checkout può non avere `.git`, e
 * un `git config` che esplode lì bloccherebbe il deploy per un hook che in
 * quel contesto non serve. Quindi ogni errore è silenzioso e l'uscita è 0.
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
