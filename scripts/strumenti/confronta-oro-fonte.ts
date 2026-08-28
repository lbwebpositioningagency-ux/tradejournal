/**
 * L'ARCHIVIO COINCIDE CON LA FONTE? Confronto seduta per seduta.
 *
 * Il buco del 2005 è provato, ma sta fuori dalla finestra a 20 anni: da solo
 * non spiega una curva stagionale diversa. Resta da sapere se, nella
 * riscrittura del 26/08/2026, sono cambiate anche le CHIUSURE dentro la
 * finestra. Qui si riscarica un periodo dalla fonte e lo si confronta riga per
 * riga con quello che c'è in archivio.
 *
 * Sola lettura su entrambi i lati: una SELECT e uno scarico.
 *
 * Uso: npx tsx scripts/strumenti/confronta-oro-fonte.ts [ANNO_DA] [ANNO_A]
 */
import { execFileSync } from "node:child_process";
import { fetchDukascopyDaily } from "@/lib/seasonality/sources/dukascopy";

const DA = Number(process.argv[2] ?? 2006);
const A = Number(process.argv[3] ?? 2010);

async function main() {
  const sql = `select date, close from "SeasonalityDailyBar" where instrument='XAUUSD' and date >= '${DA}-01-01' and date <= '${A}-12-31' order by date;`;
  const grezzo = execFileSync(
    "docker",
    ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const archivio = new Map<string, number>();
  for (const r of grezzo.split("\n")) {
    const [d, c] = r.trim().split("\t");
    if (d) archivio.set(d, Number(c));
  }

  const barre = await fetchDukascopyDaily(
    "xauusd",
    new Date(Date.UTC(DA, 0, 1)),
    new Date(Date.UTC(A, 11, 31)),
  );
  const fonte = new Map(barre.map((b) => [b.date, b.close]));

  const soloArchivio = [...archivio.keys()].filter((d) => !fonte.has(d));
  const soloFonte = [...fonte.keys()].filter((d) => !archivio.has(d));
  const diverse: string[] = [];
  for (const [d, c] of archivio) {
    const f = fonte.get(d);
    /* Tolleranza relativa a 1e-9: le due strade passano da conversioni
       numeriche diverse, e un confronto esatto segnalerebbe rumore di
       arrotondamento come divergenza. */
    if (f !== undefined && Math.abs(f - c) > Math.abs(c) * 1e-9 + 1e-9) {
      diverse.push(`${d}: archivio ${c} · fonte ${f}`);
    }
  }

  console.log(`Periodo ${DA}-${A}`);
  console.log(`  archivio: ${archivio.size} sedute`);
  console.log(`  fonte:    ${fonte.size} sedute`);
  console.log(`  presenti solo in archivio: ${soloArchivio.length}`);
  console.log(`  presenti solo alla fonte:  ${soloFonte.length}`);
  for (const d of soloFonte.slice(0, 12)) console.log(`     mancante in archivio: ${d}`);
  console.log(`  chiusure DIVERSE: ${diverse.length}`);
  for (const r of diverse.slice(0, 12)) console.log("     " + r);
  process.exit(0);
}

void main();
