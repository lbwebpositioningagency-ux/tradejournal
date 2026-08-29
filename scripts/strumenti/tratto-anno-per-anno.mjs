/**
 * UN TRATTO DELLA CURVA STAGIONALE, ANNO PER ANNO.
 *
 * La media di cinque anni può nascondere due storie opposte: quattro anni che
 * scendono insieme, oppure un anno solo che crolla e trascina gli altri. Sono
 * due situazioni che si leggono in modo diverso — la prima è una tendenza, la
 * seconda un episodio — e il grafico da solo non le distingue.
 *
 * Qui si apre la media: per ogni anno della finestra, quanto ha fatto il
 * prezzo fra due giorni dell'anno.
 *
 * Sola lettura.
 *
 * Uso: node scripts/strumenti/tratto-anno-per-anno.mjs [STRUM] [ANNI] [DA] [A]
 *   node scripts/strumenti/tratto-anno-per-anno.mjs XAUUSD 5 111 180
 */
import { execFileSync } from "node:child_process";

const STRUMENTO = process.argv[2] ?? "XAUUSD";
const FINESTRA = Number(process.argv[3] ?? 5);
const GIORNO_DA = Number(process.argv[4] ?? 111);
const GIORNO_A = Number(process.argv[5] ?? 180);

const sql = `select date, close from "SeasonalityDailyBar" where instrument='${STRUMENTO}' order by date asc;`;
const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const perAnno = new Map();
for (const r of grezzo.split("\n")) {
  const [data, close] = r.trim().split("\t");
  if (!data) continue;
  const anno = Number(data.slice(0, 4));
  const doy =
    Math.floor(
      (Date.UTC(anno, Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10))) -
        Date.UTC(anno, 0, 1)) / 86400000,
    ) + 1;
  if (!perAnno.has(anno)) perAnno.set(anno, new Map());
  perAnno.get(anno).set(doy, Number(close));
}

/** Il valore al giorno `g`, o l'ultimo noto prima: è il riporto del percorso. */
function alGiorno(mappa, g) {
  for (let k = g; k >= 1; k -= 1) if (mappa.has(k)) return { g: k, v: mappa.get(k) };
  return null;
}

function dataDi(anno, doy) {
  const d = new Date(Date.UTC(anno, 0, 1) + (doy - 1) * 86400000);
  return d.toISOString().slice(5, 10);
}

const annoCorrente = new Date().getUTCFullYear();
const anni = [];
for (let a = annoCorrente - FINESTRA; a < annoCorrente; a += 1) anni.push(a);

console.log(
  `${STRUMENTO} · giorno ${GIORNO_DA} (${dataDi(2025, GIORNO_DA)}) → giorno ${GIORNO_A} (${dataDi(2025, GIORNO_A)})\n`,
);
console.log("anno   prezzo inizio   prezzo fine    variazione     in valuta");

const variazioni = [];
for (const anno of anni) {
  const m = perAnno.get(anno);
  if (!m) {
    console.log(`${anno}   nessun dato`);
    continue;
  }
  const a = alGiorno(m, GIORNO_DA);
  const b = alGiorno(m, GIORNO_A);
  if (!a || !b) {
    console.log(`${anno}   tratto incompleto`);
    continue;
  }
  const rel = (b.v / a.v - 1) * 100;
  variazioni.push(rel);
  const seg = (x, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);
  console.log(
    `${anno}   ${a.v.toFixed(2).padStart(12)}   ${b.v.toFixed(2).padStart(11)}   ` +
      `${seg(rel).padStart(9)}%   ${seg(b.v - a.v).padStart(11)}`,
  );
}

const giu = variazioni.filter((x) => x < 0).length;
const media = variazioni.reduce((s, x) => s + x, 0) / variazioni.length;
const ordinati = [...variazioni].sort((x, y) => x - y);
const mediana =
  ordinati.length % 2
    ? ordinati[(ordinati.length - 1) / 2]
    : (ordinati[ordinati.length / 2 - 1] + ordinati[ordinati.length / 2]) / 2;

console.log(
  `\nanni in DISCESA: ${giu} su ${variazioni.length}` +
    `  ·  media ${media >= 0 ? "+" : ""}${media.toFixed(2)}%` +
    `  ·  mediana ${mediana >= 0 ? "+" : ""}${mediana.toFixed(2)}%`,
);
console.log(
  giu >= Math.ceil(variazioni.length * 0.6)
    ? "→ la discesa è condivisa dalla maggioranza degli anni: è una tendenza"
    : "→ la discesa NON è condivisa: la media è trascinata da pochi anni",
);
