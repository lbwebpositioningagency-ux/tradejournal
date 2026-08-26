/**
 * Hook di pre-commit: blocca il commit se fra i file IN STAGE c'è un segreto
 * o una risposta grezza di sonda. Guarda la versione in stage (`git show
 * :file`), non quella sul disco: è quella che finirebbe nel commit.
 *
 * Si installa da solo con `npm install` (vedi `scripts/setup-hooks.mjs`, che
 * punta `core.hooksPath` a `.githooks`). Il gate ha comunque la sua rete:
 * `src/lib/segreti-nel-repo.test.ts` rifà lo stesso controllo su TUTTI i file
 * versionati, così anche un commit fatto con `--no-verify` o da una copia
 * senza hook viene preso prima della pubblicazione.
 */
import { execFileSync } from "node:child_process";
import { violazioniIn } from "./segreti.mjs";

function git(...argomenti) {
  return execFileSync("git", argomenti, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const inStage = git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
  .split("\n")
  .map((r) => r.trim())
  .filter(Boolean);

const violazioni = [];
for (const percorso of inStage) {
  let contenuto = "";
  try {
    contenuto = git("show", `:${percorso}`);
  } catch {
    continue; // file rimosso o non leggibile come testo: niente da controllare
  }
  violazioni.push(...violazioniIn(percorso, contenuto));
}

if (violazioni.length > 0) {
  console.error("\nCommit bloccato: segreti o file di sonda in stage.\n");
  for (const v of violazioni) console.error(`  • ${v}`);
  console.error(
    "\nTogli i file dallo stage (`git restore --staged <file>`) e spostali " +
      "fuori dal progetto. Se il controllo sbaglia, l'eccezione va aggiunta " +
      "a mano in scripts/segreti.mjs, motivata.\n",
  );
  process.exit(1);
}
