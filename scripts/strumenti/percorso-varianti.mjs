/**
 * LO STESSO PERCORSO STAGIONALE, CAMBIANDO ALLINEAMENTO E FINESTRA.
 *
 * `percorso-unita.mjs` muove unità e tipo di media. Restavano due scelte non
 * misurate, ed entrambe possono cambiare la FORMA e non solo la scala:
 *
 *  - ALLINEAMENTO. Il nostro percorso usa il giorno di CALENDARIO 1-366 e
 *    riporta l'ultimo valore noto sui giorni senza seduta. L'alternativa è il
 *    n-esimo giorno di NEGOZIAZIONE: il primo giorno d'apertura di ogni anno è
 *    il punto 1, il secondo è il punto 2, e i festivi non esistono. Le due
 *    convenzioni divergono perché i festivi non cadono negli stessi giorni di
 *    calendario in anni diversi, e a metà anno lo scarto accumulato può valere
 *    diverse sedute — cioè la Pasqua di un anno finisce sopra un giorno
 *    lavorativo di un altro.
 *  - FINESTRA. «Cinque anni» non è una quantità univoca: 2021-2025 e 2020-2024
 *    sono due insiemi diversi che condividono quattro anni su cinque. Se la
 *    forma cambia molto scambiando un anno, la curva descrive quegli anni più
 *    che una stagionalità.
 *
 * Sola lettura.
 *
 * Uso: node scripts/strumenti/percorso-varianti.mjs [STRUMENTO]
 */
import { execFileSync } from "node:child_process";

const STRUMENTO = process.argv[2] ?? "XAUUSD";

const sql = `select date, close from "SeasonalityDailyBar" where instrument='${STRUMENTO}' order by date asc;`;
const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const perAnno = new Map();
const chiusuraFineAnno = new Map();
for (const r of grezzo.split("\n")) {
  const [data, close] = r.trim().split("\t");
  if (!data) continue;
  const anno = Number(data.slice(0, 4));
  if (!perAnno.has(anno)) perAnno.set(anno, []);
  perAnno.get(anno).push({ data, close: Number(close) });
  chiusuraFineAnno.set(anno, Number(close));
}

/** Percorso di un anno per GIORNO DI CALENDARIO, col riporto. */
function perCalendario(anno) {
  const base = chiusuraFineAnno.get(anno - 1);
  const sedute = perAnno.get(anno);
  if (!base || !sedute) return null;
  const out = new Array(367).fill(null);
  for (const s of sedute) {
    const g =
      Math.floor(
        (Date.UTC(anno, Number(s.data.slice(5, 7)) - 1, Number(s.data.slice(8, 10))) -
          Date.UTC(anno, 0, 1)) / 86400000,
      ) + 1;
    out[g] = s.close / base - 1;
  }
  let ultimo = 0;
  for (let g = 1; g <= 366; g += 1) {
    if (out[g] === null) out[g] = ultimo;
    else ultimo = out[g];
  }
  return out;
}

/** Percorso di un anno per n-esimo GIORNO DI NEGOZIAZIONE, senza riporto. */
function perNegoziazione(anno) {
  const base = chiusuraFineAnno.get(anno - 1);
  const sedute = perAnno.get(anno);
  if (!base || !sedute) return null;
  const out = [0];
  for (const s of sedute) out.push(s.close / base - 1);
  return out;
}

function media(percorsi, punti) {
  const out = new Array(punti + 1).fill(null);
  for (let k = 1; k <= punti; k += 1) {
    const v = percorsi.map((p) => p[k]).filter((x) => x !== undefined && x !== null);
    out[k] = v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length;
  }
  return out;
}

function discesaMaggiore(curva) {
  let picco = -Infinity, peggio = 0, da = 1, a = 1, pFin = 1;
  for (let k = 1; k < curva.length; k += 1) {
    const v = curva[k];
    if (v === null) continue;
    if (v > picco) { picco = v; pFin = k; }
    if (picco - v > peggio) { peggio = picco - v; da = pFin; a = k; }
  }
  return { profondita: peggio * 100, da, a };
}

function esegui(nome, anni, modo) {
  const punti = modo === "calendario" ? 366 : 252;
  const percorsi = anni
    .map((a) => (modo === "calendario" ? perCalendario(a) : perNegoziazione(a)))
    .filter(Boolean);
  const curva = media(percorsi, punti);
  const d = discesaMaggiore(curva);
  const tappe = modo === "calendario"
    ? [31, 91, 152, 213, 274, 335, 365]
    : [21, 63, 105, 147, 189, 231, 251];
  const valori = tappe
    .map((k) => (curva[k] === null ? "  n/d" : ((curva[k] * 100 >= 0 ? "+" : "") + (curva[k] * 100).toFixed(1)).padStart(6)))
    .join(" ");
  console.log(
    `${nome.padEnd(30)} ${valori}   |  discesa ${d.profondita.toFixed(2)} pt  (${d.da}→${d.a})`,
  );
}

const annoCorrente = new Date().getUTCFullYear();
const finestre = {
  "2021-2025 (attuale)": [2021, 2022, 2023, 2024, 2025],
  "2020-2024": [2020, 2021, 2022, 2023, 2024],
  "2022-2026 (anno in corso)": [2022, 2023, 2024, 2025, annoCorrente],
};

console.log(`${STRUMENTO} · percorso a 5 anni · valori in punti percentuali\n`);
console.log("ALLINEAMENTO PER CALENDARIO (con riporto) — il nostro");
console.log("".padEnd(30) + "  1feb   1apr   1giu   1ago   1ott   1dic  31dic");
for (const [nome, anni] of Object.entries(finestre)) esegui(nome, anni, "calendario");

console.log("\nALLINEAMENTO PER GIORNO DI NEGOZIAZIONE (senza riporto)");
console.log("".padEnd(30) + "   g21    g63   g105   g147   g189   g231   g251");
for (const [nome, anni] of Object.entries(finestre)) esegui(nome, anni, "negoziazione");
