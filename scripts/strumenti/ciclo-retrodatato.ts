/**
 * RICALCOLO DEL TREND DI TRENDS SU DATI RETRODATATI.
 *
 * Domanda a cui risponde: il «laterale» che oggi manda in N/D il ciclo dipende
 * dai dati arrivati di recente, o è lo stato in cui la sezione si trova
 * comunque? Si risponde in un modo solo: ricalcolare con le STESSE funzioni
 * del prodotto — `applyTransform` e `trendMetric`, importate, non ricopiate —
 * su serie troncate indietro nel tempo.
 *
 * LIMITE DICHIARATO: si tronca la serie di OGGI, non si recupera il vintage di
 * allora. FRED rivede i dati all'indietro, quindi per le serie riviste
 * (payroll, PIL, JOLTS) questo è un'approssimazione. Per tutte le altre — e
 * per la domanda che conta, cioè «quante osservazioni sono entrate nella
 * finestra da allora» — è esatto.
 *
 * Sola lettura: non scrive niente, né su disco né sul database.
 *
 * Uso: npx tsx scripts/strumenti/ciclo-retrodatato.ts [giorni...]   (default 7 14 30 90)
 */
import { applyTransform } from "@/lib/macro-trends-transforms";
import {
  TREND_WINDOW,
  TREND_Z_THRESHOLD,
  trendMetric,
} from "@/lib/macro-trends-metrics";
import { TRENDS_SERIES } from "@/lib/macro-trends-series";
import { fetchFredSeries, type FredObservation } from "@/lib/fred";

const ARRETRATI = process.argv.slice(2).map(Number).filter(Number.isFinite);
const GIORNI = ARRETRATI.length > 0 ? ARRETRATI : [7, 14, 30, 90];

function meno(giorni: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - giorni);
  return d.toISOString().slice(0, 10);
}

function tronca(obs: FredObservation[], limite: string): FredObservation[] {
  return obs.filter((o) => o.date <= limite);
}

async function main() {
  /* Le serie che partecipano al ciclo: la Volatilità è esclusa nel prodotto
     (`includeCycle: def.section !== "volatilita"`), quindi anche qui. */
  const serie = TRENDS_SERIES.filter((d) => d.section !== "volatilita");
  console.log(
    `Serie con ciclo: ${serie.length} · finestra del trend: ${TREND_WINDOW} osservazioni · soglia |z|: ${TREND_ZS()}`,
  );
  console.log(
    `Oggi: ${meno(0)} · retrodatazioni: ${GIORNI.map((g) => `${g}gg → ${meno(g)}`).join(" · ")}\n`,
  );

  const conteggi = new Map<string, Record<string, number>>();
  const righe: string[] = [];

  for (const def of serie) {
    let obs: FredObservation[];
    try {
      obs = applyTransform((await fetchFredSeries(def.fredIds)).observations, def.transform);
    } catch (e) {
      righe.push(`${def.key.padEnd(22)} FONTE NON RAGGIUNTA (${String(e).slice(0, 60)})`);
      continue;
    }
    if (obs.length === 0) {
      righe.push(`${def.key.padEnd(22)} serie vuota dopo la trasformazione`);
      continue;
    }

    const celle: string[] = [];
    for (const g of [0, ...GIORNI]) {
      const t = g === 0 ? obs : tronca(obs, meno(g));
      const m = trendMetric(t);
      const etichetta = m === null ? "n/d" : m.label;
      const z = m === null ? "" : ` z=${m.z.toFixed(2)}`;
      celle.push(`${etichetta}${z} (n=${t.length})`);
      const k = g === 0 ? "oggi" : `${g}gg`;
      const c = conteggi.get(k) ?? {};
      c[etichetta] = (c[etichetta] ?? 0) + 1;
      conteggi.set(k, c);
    }
    righe.push(`${def.key.padEnd(22)} ${celle.join("  |  ")}`);
  }

  console.log(righe.join("\n"));
  console.log("\n── CONTEGGIO PER RETRODATAZIONE ──");
  for (const [k, c] of conteggi) {
    console.log(`  ${k.padEnd(6)} ${JSON.stringify(c)}`);
  }
  process.exit(0);
}

function TREND_ZS() {
  return TREND_Z_THRESHOLD.toFixed(3);
}

void main();
