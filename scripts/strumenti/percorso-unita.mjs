/**
 * LO STESSO PERCORSO STAGIONALE, COSTRUITO IN QUATTRO MODI.
 *
 * Serve a rispondere a una domanda sola: quale scelta di metodo produce la
 * discesa che vediamo noi e che nel grafico di Seasonal Tendencies non c'è.
 * Si cambia UNA cosa alla volta e si guarda la forma, invece di elencare
 * possibilità.
 *
 * Le quattro combinazioni:
 *   %-media    rendimento cumulato in PERCENTUALE, media aritmetica fra anni
 *   %-mediana  idem, ma mediana
 *   $-media    variazione cumulata in VALUTA dal 31/12 precedente, media
 *   $-mediana  idem, ma mediana
 *
 * La differenza fra percentuale e valuta non è una riscalatura: cambia il
 * PESO degli anni. In percentuale un movimento di 100 $ nel 2021, con l'oro a
 * 1.800, pesa più dello stesso movimento nel 2025 con l'oro a 3.000; in valuta
 * pesano uguale, quindi gli anni recenti — che sono anche i più mossi —
 * dominano la media. È il tipo di scelta che può far comparire o sparire una
 * discesa.
 *
 * Sola lettura.
 *
 * Uso: node scripts/strumenti/percorso-unita.mjs [STRUMENTO] [ANNI]
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

const perAnno = new Map();
const chiusuraFineAnno = new Map();
for (const r of grezzo.split("\n")) {
  const [data, close] = r.trim().split("\t");
  if (!data) continue;
  const anno = Number(data.slice(0, 4));
  const c = Number(close);
  if (!perAnno.has(anno)) perAnno.set(anno, []);
  perAnno.get(anno).push({ data, close: c });
  chiusuraFineAnno.set(anno, c); // l'ultima vista resta: è la chiusura d'anno
}

const annoCorrente = new Date().getUTCFullYear();
const anni = [];
for (let a = annoCorrente - FINESTRA; a < annoCorrente; a += 1) anni.push(a);

/* Allineamento per GIORNO DI CALENDARIO (1-366), che è la convenzione del
   nostro precalcolo: ogni anno porta il suo valore al giorno n, e i giorni
   senza seduta ereditano l'ultimo valore noto. */
function percorsoAnno(anno, inValuta) {
  const base = chiusuraFineAnno.get(anno - 1);
  const sedute = perAnno.get(anno);
  if (!base || !sedute) return null;
  const out = new Array(367).fill(null);
  for (const s of sedute) {
    const g = Math.floor(
      (Date.UTC(anno, Number(s.data.slice(5, 7)) - 1, Number(s.data.slice(8, 10))) -
        Date.UTC(anno, 0, 1)) / 86400000,
    ) + 1;
    out[g] = inValuta ? s.close - base : s.close / base - 1;
  }
  let ultimo = 0;
  for (let g = 1; g <= 366; g += 1) {
    if (out[g] === null) out[g] = ultimo;
    else ultimo = out[g];
  }
  return out;
}

function aggrega(inValuta, mediana) {
  const percorsi = anni.map((a) => percorsoAnno(a, inValuta)).filter(Boolean);
  const out = new Array(367).fill(0);
  for (let g = 1; g <= 366; g += 1) {
    const v = percorsi.map((p) => p[g]).sort((x, y) => x - y);
    out[g] = mediana
      ? v.length % 2
        ? v[(v.length - 1) / 2]
        : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
      : v.reduce((s, x) => s + x, 0) / v.length;
  }
  return out;
}

const varianti = {
  "%-media": aggrega(false, false),
  "%-mediana": aggrega(false, true),
  "$-media": aggrega(true, false),
  "$-mediana": aggrega(true, true),
};

const TAPPE = [1, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];
const NOMI = ["1gen", "1feb", "1mar", "1apr", "1mag", "1giu", "1lug", "1ago", "1set", "1ott", "1nov", "1dic", "31dic"];

console.log(`${STRUMENTO} · finestra ${FINESTRA} anni · anni ${anni[0]}-${anni.at(-1)}\n`);
console.log("giorno   " + Object.keys(varianti).map((k) => k.padStart(11)).join(""));
for (let i = 0; i < TAPPE.length; i += 1) {
  const g = TAPPE[i];
  const celle = Object.entries(varianti).map(([k, v]) => {
    const x = k.startsWith("%") ? v[g] * 100 : v[g];
    return ((x >= 0 ? "+" : "") + x.toFixed(2)).padStart(11);
  });
  console.log(NOMI[i].padEnd(9) + celle.join(""));
}

/* La DISCESA più profonda di ciascuna variante: da dove parte, dove arriva,
   quanto vale. È il numero che dice se una scelta la fa sparire. */
console.log("\nDISCESA MAGGIORE (dal massimo precedente):");
for (const [k, v] of Object.entries(varianti)) {
  let picco = -Infinity, peggio = 0, gPicco = 1, gFondo = 1, pFin = 1;
  for (let g = 1; g <= 366; g += 1) {
    if (v[g] > picco) { picco = v[g]; pFin = g; }
    const giu = picco - v[g];
    if (giu > peggio) { peggio = giu; gPicco = pFin; gFondo = g; }
  }
  const scala = k.startsWith("%") ? 100 : 1;
  console.log(
    `  ${k.padEnd(10)} ${(peggio * scala).toFixed(2)}${k.startsWith("%") ? " punti %" : " valuta"}` +
      `  dal giorno ${gPicco} al giorno ${gFondo}`,
  );
}
