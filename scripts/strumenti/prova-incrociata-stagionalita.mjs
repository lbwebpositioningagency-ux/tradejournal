/**
 * PROVA INCROCIATA sulla stagionalità mensile dell'oro.
 *
 * Ricalcola la media stagionale a 20 anni partendo dalle BARRE GREZZE in
 * archivio, senza importare una sola funzione del prodotto: se il risultato
 * combacia con quello che l'app mostra, il calcolo è coerente coi dati e un
 * eventuale cambiamento viene dai dati; se non combacia, il problema è
 * nell'aggregazione.
 *
 * Si calcolano DUE convenzioni di rendimento mensile e DUE tipi di media,
 * perché la domanda «qual è la convenzione giusta» non si risolve assumendola:
 * si vede quale delle quattro combinazioni riproduce il numero a schermo.
 *
 * Sola lettura: una SELECT, niente scritture.
 *
 * Uso: node scripts/strumenti/prova-incrociata-stagionalita.mjs [STRUMENTO] [ANNI]
 */
import { execFileSync } from "node:child_process";

const STRUMENTO = process.argv[2] ?? "XAUUSD";
const ANNI = Number(process.argv[3] ?? 20);

const sql = `select date, close from "SeasonalityDailyBar" where instrument='${STRUMENTO}' order by date asc;`;
const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const barre = grezzo
  .split("\n")
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => {
    const [data, close] = r.split("\t");
    return { data, close: Number(close) };
  })
  .filter((b) => Number.isFinite(b.close));

/* Ultima seduta di ogni mese civile: è il punto d'appoggio di entrambe le
   convenzioni, e si prende dai dati invece di assumere il calendario. */
const ultimaDelMese = new Map();
const primaDelMese = new Map();
for (const b of barre) {
  const ym = b.data.slice(0, 7);
  ultimaDelMese.set(ym, b);
  if (!primaDelMese.has(ym)) primaDelMese.set(ym, b);
}
const mesi = [...ultimaDelMese.keys()].sort();

/* L'ANNO IN CORSO SI ESCLUDE: la Stagionalità dichiara di usare solo anni
   solari completi, e un agosto a metà falserebbe la media di agosto. */
const annoCorrente = new Date().getUTCFullYear();
const anniUsati = [];
for (let a = annoCorrente - 1; a >= annoCorrente - ANNI; a -= 1) anniUsati.push(a);
anniUsati.sort();

const risultati = [];
for (let m = 1; m <= 12; m += 1) {
  const mm = String(m).padStart(2, "0");
  const chiusuraSuChiusura = [];
  const dentroIlMese = [];
  for (const anno of anniUsati) {
    const ym = `${anno}-${mm}`;
    const fine = ultimaDelMese.get(ym);
    const inizio = primaDelMese.get(ym);
    if (!fine || !inizio) continue;

    // Convenzione A: chiusura di fine mese contro chiusura di fine mese
    // PRECEDENTE (il mese "possiede" anche il salto della prima seduta).
    const iPrec = mesi.indexOf(ym) - 1;
    if (iPrec >= 0) {
      const finePrec = ultimaDelMese.get(mesi[iPrec]);
      if (finePrec && finePrec.close > 0) {
        chiusuraSuChiusura.push(fine.close / finePrec.close - 1);
      }
    }
    // Convenzione B: prima chiusura del mese contro l'ultima dello stesso mese.
    if (inizio.close > 0) dentroIlMese.push(fine.close / inizio.close - 1);
  }

  const aritmetica = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const geometrica = (v) =>
    Math.pow(v.reduce((s, x) => s * (1 + x), 1), 1 / v.length) - 1;

  risultati.push({
    mese: m,
    n: chiusuraSuChiusura.length,
    A_aritm: aritmetica(chiusuraSuChiusura) * 100,
    A_geom: geometrica(chiusuraSuChiusura) * 100,
    B_aritm: aritmetica(dentroIlMese) * 100,
    B_geom: geometrica(dentroIlMese) * 100,
  });
}

const NOMI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
console.log(`${STRUMENTO} · finestra ${ANNI} anni · anni usati ${anniUsati[0]}-${anniUsati.at(-1)}`);
console.log(`barre in archivio: ${barre.length} (${barre[0].data} → ${barre.at(-1).data})\n`);
console.log("mese   n   A:chius→chius        B:dentro il mese");
console.log("           aritm     geom      aritm     geom");
for (const r of risultati) {
  const f = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
  console.log(
    `${NOMI[r.mese - 1]}   ${String(r.n).padStart(2)}   ` +
      `${f(r.A_aritm).padStart(7)}  ${f(r.A_geom).padStart(7)}   ` +
      `${f(r.B_aritm).padStart(7)}  ${f(r.B_geom).padStart(7)}`,
  );
}
