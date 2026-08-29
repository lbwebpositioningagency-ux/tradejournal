/**
 * MEDIARE PRIMA O COSTRUIRE PRIMA: le due curve, affiancate.
 *
 * Due modi di costruire la stessa curva stagionale, che si somigliano tanto da
 * poter essere scambiati leggendo il codice:
 *
 *   A — PERCORSI POI MEDIA: si costruisce il percorso cumulato di ogni anno,
 *       e al giorno g si fa la media dei percorsi. È quello che la pagina
 *       dichiara di fare.
 *   B — MEDIA POI PERCORSO: al giorno g si fa la media dei RENDIMENTI di
 *       quel giorno fra gli anni, e poi si cumula.
 *
 * Con la somma cumulata dei logaritmi e la media aritmetica le due coincidono
 * ESATTAMENTE — la somma e la media commutano — a una condizione: che ogni
 * giorno abbia lo stesso insieme di anni. Se un anno manca in un giorno e
 * c'è in un altro, il denominatore della media cambia da un giorno all'altro e
 * B smette di essere la cumulata di A. Questo script misura se la condizione
 * regge sui dati veri, invece di darla per buona.
 *
 * Sola lettura.
 *
 * Uso: node scripts/strumenti/ordine-media.mjs [STRUMENTO] [ANNI]
 */
import { execFileSync } from "node:child_process";

const STRUMENTO = process.argv[2] ?? "XAUUSD";
const FINESTRA = Number(process.argv[3] ?? 5);

const sql = `select date, close from "SeasonalityDailyBar" where instrument='${STRUMENTO}' order by date asc;`;
const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const barre = [];
for (const r of grezzo.split("\n")) {
  const [data, close] = r.trim().split("\t");
  if (data) barre.push({ data, close: Number(close) });
}

/** Rendimenti LOG giornalieri, come `dailyLogReturns`. */
const rendimenti = [];
for (let i = 1; i < barre.length; i += 1) {
  rendimenti.push({
    data: barre[i].data,
    r: Math.log(barre[i].close / barre[i - 1].close),
  });
}

const doy = (data) => {
  const a = Number(data.slice(0, 4));
  return (
    Math.floor(
      (Date.UTC(a, Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10))) -
        Date.UTC(a, 0, 1)) / 86400000,
    ) + 1
  );
};

const annoCorrente = new Date().getUTCFullYear();
const anni = [];
for (let a = annoCorrente - FINESTRA; a < annoCorrente; a += 1) anni.push(a);

/* A — il percorso di ogni anno, col riporto, come `cumulativePathsByYear`. */
const percorsi = new Map();
for (const anno of anni) {
  const p = new Array(367).fill(0);
  let cum = 0;
  let cursore = 1;
  for (const x of rendimenti.filter((y) => Number(y.data.slice(0, 4)) === anno)) {
    const g = doy(x.data);
    for (; cursore < g; cursore += 1) p[cursore] = cum;
    cum += x.r;
    p[g] = cum;
    cursore = g + 1;
  }
  for (; cursore <= 366; cursore += 1) p[cursore] = cum;
  percorsi.set(anno, p);
}
const A = new Array(367).fill(0);
for (let g = 1; g <= 366; g += 1) {
  const v = anni.map((a) => percorsi.get(a)[g]);
  A[g] = v.reduce((s, x) => s + x, 0) / v.length;
}

/* B — media dei rendimenti giorno per giorno, poi cumulata. Un giorno senza
   quotazione in un dato anno NON contribuisce: è la differenza che conta. */
const perGiorno = new Map();
for (const x of rendimenti) {
  const anno = Number(x.data.slice(0, 4));
  if (!anni.includes(anno)) continue;
  const g = doy(x.data);
  if (!perGiorno.has(g)) perGiorno.set(g, []);
  perGiorno.get(g).push(x.r);
}
const B = new Array(367).fill(0);
let cum = 0;
const denominatori = new Set();
for (let g = 1; g <= 366; g += 1) {
  const v = perGiorno.get(g) ?? [];
  if (v.length > 0) {
    denominatori.add(v.length);
    cum += v.reduce((s, x) => s + x, 0) / v.length;
  }
  B[g] = cum;
}

const TAPPE = [1, 40, 80, 120, 160, 200, 240, 280, 320, 366];
console.log(`${STRUMENTO} · finestra ${FINESTRA} anni (${anni[0]}-${anni.at(-1)}) · punti percentuali\n`);
console.log("giorno   A: percorsi poi media   B: media poi percorso   differenza");
let peggiore = 0;
for (const g of TAPPE) {
  const d = (A[g] - B[g]) * 100;
  if (Math.abs(d) > Math.abs(peggiore)) peggiore = d;
  const f = (x) => ((x >= 0 ? "+" : "") + x.toFixed(3)).padStart(9);
  console.log(`${String(g).padStart(6)}   ${f(A[g] * 100).padStart(20)}   ${f(B[g] * 100).padStart(21)}   ${f(d)}`);
}
console.log(
  `\ndifferenza massima sulle tappe: ${peggiore.toFixed(4)} punti percentuali`,
);
console.log(
  `numero di anni per giorno (denominatore di B): ${[...denominatori].sort((a, b) => a - b).join(", ")}`,
);
console.log(
  peggiore === 0
    ? "→ le due curve COINCIDONO esattamente"
    : "→ le due curve DIFFERISCONO: il denominatore non è costante fra i giorni",
);
