/**
 * LA CURVA STAGIONALE COSTRUITA COME LA FANNO I SITI DI SETTORE.
 *
 * Seasonax dichiara che l'asse verticale è «the level of the seasonal pattern
 * (indexed to 100)». Il metodo che ne discende — e che qui si mette alla prova
 * — è: ogni anno viene portato a base 100 al primo giorno, e poi si fa la
 * media degli INDICI DI PREZZO, non dei logaritmi.
 *
 * Non è una riscalatura del nostro. Mediare rapporti e mediare logaritmi sono
 * due operazioni diverse: la media aritmetica dei rapporti è sempre maggiore o
 * uguale a quella geometrica (disuguaglianza di Jensen), e lo scarto cresce
 * con la dispersione fra gli anni. Con anni molto diversi fra loro — l'oro fra
 * il 2021 e il 2025 lo è — lo scarto è visibile a occhio nudo.
 *
 * Tre curve a confronto, sugli stessi identici dati:
 *   NOSTRA      somma cumulata dei log-rendimenti, media aritmetica fra anni
 *   BASE100-1G  indice con base al primo giorno dell'anno, media degli indici
 *   BASE100-CP  indice con base alla chiusura precedente (31/12), media
 *
 * Sola lettura.
 *
 * Uso: node scripts/strumenti/percorso-base100.mjs [STRUMENTO] [ANNI]
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
const ultimaDellAnno = new Map();
for (const r of grezzo.split("\n")) {
  const [data, close] = r.trim().split("\t");
  if (!data) continue;
  const anno = Number(data.slice(0, 4));
  if (!perAnno.has(anno)) perAnno.set(anno, []);
  perAnno.get(anno).push({ data, close: Number(close) });
  ultimaDellAnno.set(anno, Number(close));
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

/** Serie giornaliera di un anno, riempita col riporto, come rapporto su `base`. */
function indiceAnno(anno, base) {
  const sedute = perAnno.get(anno);
  if (!sedute || !base) return null;
  const out = new Array(367).fill(null);
  for (const s of sedute) out[doy(s.data)] = s.close / base;
  let ultimo = 1;
  for (let g = 1; g <= 366; g += 1) {
    if (out[g] === null) out[g] = ultimo;
    else ultimo = out[g];
  }
  return out;
}

/** NOSTRA: cumulata dei log, media aritmetica, resa come indice. */
function nostra() {
  const percorsi = anni
    .map((anno) => {
      const base = ultimaDellAnno.get(anno - 1);
      const idx = indiceAnno(anno, base);
      return idx ? idx.map((x) => (x === null ? null : Math.log(x))) : null;
    })
    .filter(Boolean);
  const out = new Array(367).fill(null);
  for (let g = 1; g <= 366; g += 1) {
    const v = percorsi.map((p) => p[g]);
    out[g] = v.reduce((s, x) => s + x, 0) / v.length;
  }
  return out.map((x) => (x === null ? null : Math.exp(x) * 100));
}

/** BASE 100: media aritmetica degli INDICI. */
function base100(usaChiusuraPrecedente) {
  const indici = anni
    .map((anno) => {
      const base = usaChiusuraPrecedente
        ? ultimaDellAnno.get(anno - 1)
        : perAnno.get(anno)?.[0]?.close;
      return indiceAnno(anno, base);
    })
    .filter(Boolean);
  const out = new Array(367).fill(null);
  for (let g = 1; g <= 366; g += 1) {
    const v = indici.map((p) => p[g]);
    out[g] = (v.reduce((s, x) => s + x, 0) / v.length) * 100;
  }
  return out;
}

const curve = {
  NOSTRA: nostra(),
  "BASE100-1G": base100(false),
  "BASE100-CP": base100(true),
};

function discesa(c) {
  let picco = -Infinity, peggio = 0, da = 1, a = 1, pFin = 1;
  for (let g = 1; g <= 366; g += 1) {
    if (c[g] > picco) { picco = c[g]; pFin = g; }
    if (picco - c[g] > peggio) { peggio = picco - c[g]; da = pFin; a = g; }
  }
  return { peggio, da, a };
}

const TAPPE = [1, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];
const NOMI = ["1gen","1feb","1mar","1apr","1mag","1giu","1lug","1ago","1set","1ott","1nov","1dic","31dic"];

console.log(`${STRUMENTO} · finestra ${FINESTRA} anni (${anni[0]}-${anni.at(-1)}) · indice, base 100\n`);
console.log("giorno   " + Object.keys(curve).map((k) => k.padStart(13)).join(""));
for (let i = 0; i < TAPPE.length; i += 1) {
  const g = TAPPE[i];
  console.log(
    NOMI[i].padEnd(9) +
      Object.values(curve).map((c) => c[g].toFixed(2).padStart(13)).join(""),
  );
}
console.log("\nDISCESA MAGGIORE (in punti d'indice):");
for (const [k, c] of Object.entries(curve)) {
  const d = discesa(c);
  console.log(`  ${k.padEnd(12)} ${d.peggio.toFixed(2)}  dal giorno ${d.da} al ${d.a}`);
}
console.log("\nFINE ANNO, come variazione percentuale:");
for (const [k, c] of Object.entries(curve)) {
  console.log(`  ${k.padEnd(12)} ${(c[366] - 100 >= 0 ? "+" : "") + (c[366] - 100).toFixed(2)}%`);
}
