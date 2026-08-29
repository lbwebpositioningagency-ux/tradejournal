/**
 * IL REGISTRO DELLE VARIAZIONI DELLA STAGIONALITÀ, in chiaro.
 *
 * Risponde alla domanda che il 26/08/2026 non aveva risposta: «questo numero
 * è cambiato quando, e prima quanto valeva?». Ogni riga di
 * `SeasonalityImpronta` è un CAMBIAMENTO — non un giro — quindi due righe
 * consecutive sono il prima e il dopo, e `primaVista` è la data esatta.
 *
 * Sola lettura: non scrive niente. Chi prende l'impronta è il cron, oppure
 * `scripts/impronta-stagionalita.ts` a mano.
 *
 * Uso: node scripts/strumenti/impronta-storia.mjs [STRUMENTO] [FINESTRA]
 *   node scripts/strumenti/impronta-storia.mjs XAUUSD 20
 */
import { execFileSync } from "node:child_process";

const STRUMENTO = process.argv[2] ?? "XAUUSD";
const FINESTRA = Number(process.argv[3] ?? 20);

const sql = `select "primaVista", "ultimaVista", barre, "primaData", "ultimaData", payload
  from "SeasonalityImpronta"
  where instrument='${STRUMENTO}' and "lookbackYears"=${FINESTRA}
  order by "primaVista" asc;`;

const grezzo = execFileSync(
  "docker",
  ["exec", "tradejournal-db", "psql", "-U", "tradejournal", "-d", "tradejournal",
   "-t", "-A", "-F", "\t", "-c", sql],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const righe = grezzo
  .split("\n")
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => {
    const [primaVista, ultimaVista, barre, primaData, ultimaData, payload] =
      r.split("\t");
    return {
      primaVista,
      ultimaVista,
      barre: Number(barre),
      primaData,
      ultimaData,
      dati: JSON.parse(payload),
    };
  });

if (righe.length === 0) {
  console.log(
    `Nessuna impronta per ${STRUMENTO} a ${FINESTRA} anni.\n` +
      `Il registro parte dal primo giro dopo l'installazione: se il deploy è\n` +
      `recente, lancia "npx tsx scripts/impronta-stagionalita.ts".`,
  );
  process.exit(0);
}

const quando = (s) => s.slice(0, 16).replace(" ", " ore ");

console.log(`${STRUMENTO} · finestra ${FINESTRA} anni · ${righe.length} stati registrati\n`);

for (let i = 0; i < righe.length; i += 1) {
  const r = righe[i];
  const f = r.dati.finestre[0];
  const gen = f.mesi.find((m) => m.bucket === 1);
  console.log(
    `${quando(r.primaVista)}   ${String(r.barre).padStart(6)} barre   ` +
      `${r.primaData} → ${r.ultimaData}   ` +
      `gen n=${gen ? gen.n : "—"} media ${gen ? gen.media.toFixed(6) : "—"}   ` +
      `fine anno ${f.fineAnno === null ? "—" : f.fineAnno.toFixed(6)}`,
  );

  const p = righe[i - 1];
  if (!p) continue;
  const pf = p.dati.finestre[0];
  const note = [];
  if (r.barre !== p.barre) {
    note.push(`barre ${r.barre > p.barre ? "+" : ""}${r.barre - p.barre}`);
  }
  if (r.primaData !== p.primaData) note.push(`inizio ${p.primaData}→${r.primaData}`);
  for (const m of f.mesi) {
    const pm = pf.mesi.find((x) => x.bucket === m.bucket);
    if (!pm) continue;
    if (pm.n !== m.n) note.push(`bucket ${m.bucket} n ${pm.n}→${m.n}`);
    else if (pm.media.toFixed(8) !== m.media.toFixed(8)) {
      note.push(`bucket ${m.bucket} media cambiata a n invariato`);
    }
  }
  if (note.length > 0) console.log(`${" ".repeat(19)}↑ ${note.join(" · ")}`);
}

const ultima = righe[righe.length - 1];
console.log(
  `\nLo stato corrente regge dal ${quando(ultima.primaVista)}, ` +
    `confermato l'ultima volta il ${quando(ultima.ultimaVista)}.`,
);
