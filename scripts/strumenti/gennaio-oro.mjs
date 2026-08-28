/**
 * I rendimenti di GENNAIO dell'oro, anno per anno, dalle barre grezze.
 *
 * Serve a un solo scopo: la prova incrociata ha trovato undici mesi su dodici
 * identici a quelli in pagina e gennaio no — e in pagina gennaio dichiara
 * `n = 19` invece di 20. Un anno viene escluso, e questo elenco dice quale e
 * quanto vale.
 *
 * Sola lettura.
 */
import { execFileSync } from "node:child_process";

const sql = `select date, close from "SeasonalityDailyBar" where instrument='XAUUSD' order by date asc;`;
const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const ultima = new Map();
const conteggio = new Map();
for (const riga of grezzo.split("\n")) {
  const [data, close] = riga.trim().split("\t");
  if (!data) continue;
  const ym = data.slice(0, 7);
  ultima.set(ym, Number(close));
  conteggio.set(ym, (conteggio.get(ym) ?? 0) + 1);
}
const mesi = [...ultima.keys()].sort();

console.log("anno  chiusura dic  chiusura gen   rend. gen   sedute gen   sedute dic");
for (let anno = 2006; anno <= 2025; anno += 1) {
  const gen = `${anno}-01`;
  const dic = `${anno - 1}-12`;
  const cg = ultima.get(gen);
  const cd = ultima.get(dic);
  const r = cg && cd ? ((cg / cd - 1) * 100).toFixed(2) : "n/d";
  console.log(
    `${anno}  ${String(cd ?? "n/d").padStart(12)}  ${String(cg ?? "n/d").padStart(12)}  ` +
      `${String(r).padStart(9)}%  ${String(conteggio.get(gen) ?? 0).padStart(10)}  ${String(conteggio.get(dic) ?? 0).padStart(10)}`,
  );
  void mesi;
}
