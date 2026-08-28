/**
 * Chi ha toccato cosa, nelle aree contese fra due sessioni che lavorano sullo
 * stesso `main`.
 *
 * Non è curiosità: quando due rami riscrivono gli stessi file nello stesso
 * pomeriggio, un ripristino regge fino al push successivo dell'altro. Sapere
 * QUALI file sono contesi è la condizione per decidere chi li tiene, ed è
 * l'unica cosa che impedisce di rifare lo stesso giro tre volte.
 *
 * Uso: node scripts/contesi.mjs <commit-base> <sha-dei-miei...>
 */
import { execFileSync } from "node:child_process";

const [, , base, ...miei] = process.argv;
if (!base) {
  console.error("Uso: node scripts/contesi.mjs <base> <sha miei...>");
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8" });

const tutti = git("log", "--format=%h|%ad|%s", "--date=format:%H:%M", `${base}..HEAD`)
  .split("\n")
  .filter(Boolean)
  .map((r) => {
    const [sha, ora, ...resto] = r.split("|");
    return { sha, ora, titolo: resto.join("|"), mio: miei.includes(sha) };
  });

const fileDi = (sha) =>
  git("show", "--name-only", "--format=", sha).split("\n").filter(Boolean);

const AREE = {
  Stagionalità: /seasonality|stagionalita/i,
  Driver: /driver-desk|macro-desk\/driver/i,
  COT: /cot-/i,
};

const daMe = new Set();
const daAltri = new Set();
for (const c of tutti) {
  for (const f of fileDi(c.sha)) (c.mio ? daMe : daAltri).add(f);
}

const contesi = [...daMe].filter((f) => daAltri.has(f)).sort();

console.log("COMMIT DI OGGI NON MIEI:");
for (const c of tutti.filter((c) => !c.mio)) {
  console.log(`  ${c.ora}  ${c.sha}  ${c.titolo}`);
}

console.log("\nFILE CONTESI (toccati da entrambe le sessioni):");
for (const f of contesi) console.log("  " + f);

console.log("\nNELLE TRE AREE INDICATE, toccati dall'altra sessione:");
for (const [nome, re] of Object.entries(AREE)) {
  const suoi = [...daAltri].filter((f) => re.test(f)).sort();
  console.log(`  ${nome}: ${suoi.length ? "" : "nessuno"}`);
  for (const f of suoi) console.log("    " + f + (daMe.has(f) ? "   ← CONTESO" : ""));
}
