/**
 * MAPPA DEI BUCHI di tutte le serie giornaliere della Stagionalità.
 *
 * Un mese intero mancante non è un dettaglio: toglie un'osservazione a ogni
 * statistica che attraversa quel confine, e lo fa in silenzio. Sull'oro un
 * buco di dodici mesi (tutto il 2005) è passato inosservato per due giorni
 * perché il job era finito verde. Questo lo cerca su ogni strumento.
 *
 * Sola lettura.
 *
 * Uso: node scripts/strumenti/buchi-serie.mjs [SOGLIA_SEDUTE]
 */
import { execFileSync } from "node:child_process";

const SOGLIA = Number(process.argv[2] ?? 15);

const sql = `select instrument, to_char(date,'YYYY-MM') ym, count(*) n from "SeasonalityDailyBar" group by 1,2 order by 1,2;`;
const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal", "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const perStrumento = new Map();
for (const r of grezzo.split("\n")) {
  const [s, ym, n] = r.trim().split("\t");
  if (!s) continue;
  if (!perStrumento.has(s)) perStrumento.set(s, new Map());
  perStrumento.get(s).set(ym, Number(n));
}

/* Il calendario dei mesi attesi si costruisce, non si legge dalle chiavi: un
   mese assente dalla tabella non comparirebbe mai in un elenco fatto sulle
   chiavi presenti, che è esattamente il caso che si vuole trovare. */
function mesiAttesi(primo, ultimo) {
  const out = [];
  let [a, m] = primo.split("-").map(Number);
  const [af, mf] = ultimo.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

let totaleVuoti = 0;
for (const [strumento, mesi] of perStrumento) {
  const chiavi = [...mesi.keys()].sort();
  const attesi = mesiAttesi(chiavi[0], chiavi.at(-1));
  const vuoti = attesi.filter((ym) => !mesi.has(ym));
  const magri = attesi.filter((ym) => mesi.has(ym) && mesi.get(ym) < SOGLIA);
  const righe = [...mesi.values()].reduce((s, x) => s + x, 0);
  totaleVuoti += vuoti.length;

  console.log(
    `\n${strumento.padEnd(8)} ${String(righe).padStart(6)} sedute · ${chiavi[0]} → ${chiavi.at(-1)} · ${attesi.length} mesi attesi`,
  );
  if (vuoti.length === 0 && magri.length === 0) {
    console.log("         nessun buco");
    continue;
  }
  if (vuoti.length > 0) {
    /* I mesi vuoti si stampano come INTERVALLI: dodici righe consecutive
       nascondono che è un anno intero, una riga «2005-01 → 2005-12» no. */
    const gruppi = [];
    for (const ym of vuoti) {
      const ultimo = gruppi.at(-1);
      if (ultimo && mesiAttesi(ultimo.a, ym).length === ultimo.len + 1) {
        ultimo.a = ym;
        ultimo.len += 1;
      } else gruppi.push({ da: ym, a: ym, len: 1 });
    }
    console.log(`         VUOTI (${vuoti.length} mesi):`);
    for (const g of gruppi) {
      console.log(`           ${g.da}${g.len > 1 ? ` → ${g.a}  (${g.len} mesi)` : ""}`);
    }
  }
  if (magri.length > 0) {
    console.log(`         SOTTO ${SOGLIA} SEDUTE (${magri.length}):`);
    for (const ym of magri) console.log(`           ${ym}  ${mesi.get(ym)}`);
  }
}
console.log(`\nTOTALE MESI VUOTI SU TUTTE LE SERIE: ${totaleVuoti}`);
