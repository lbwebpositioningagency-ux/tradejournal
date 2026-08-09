/**
 * Anteprima testuale del DOSSIER dell'AI Analyst sui dati locali: raccoglie le
 * letture con il motore vero e le stampa, strumento per strumento. Serve a
 * guardare in faccia ciò che arriva in pasto al modello PRIMA che ci sia una
 * pagina, e a controllare i numeri con una verifica indipendente.
 *
 *   npx tsx scripts/ai-analyst-preview.ts
 *   npx tsx scripts/ai-analyst-preview.ts --json
 *   npx tsx scripts/ai-analyst-preview.ts --report-fresco
 *
 * `--report-fresco` NON inventa dati: prende lo stesso identico report che c'è
 * in archivio e ne finge la data come se fosse di oggi, per far vedere che
 * aspetto avrebbe il dossier in produzione (dove il report arriva ogni
 * giorno). L'anteprima lo dichiara a caratteri cubitali: è una SIMULAZIONE.
 */

import "./ai-analyst-env";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import { AI_ANALYST_LIST } from "@/lib/ai-analyst/instruments";
import type { Dossier, FattorePresente } from "@/lib/ai-analyst/types";
import { ETICHETTA_ASSENZA, ETICHETTA_CARATTERE } from "@/lib/ai-analyst/types";
import {
  caricaFontiCondivise,
  caricaLetture,
  giornoRoma,
  type FontiCondivise,
} from "@/lib/queries/ai-analyst";
import { prisma } from "@/lib/db";

const soloJson = process.argv.includes("--json");
const reportFresco = process.argv.includes("--report-fresco");

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const num = (v: number, d = 2) => v.toFixed(d).replace(".", ",");

function descrivi(f: FattorePresente): string[] {
  const v = f.valore;
  switch (v.tipo) {
    case "termometro_stato":
      return [
        `${v.indiceIv} a ${num(v.iv, v.decimaliIv)} · stato ${v.stato}`,
        v.posizione.modalita === "puntuale"
          ? `posizione nella propria storia: ${num(v.posizione.percentile, 1)} su 100 (${v.finestraSchermo})`
          : `posizione nella propria storia: fra ${v.posizione.da} e ${v.posizione.a} su 100 (${v.finestraSchermo})`,
      ];
    case "termometro_ampiezza":
      return [
        `escursione abituale: mediana ${num(v.relativa.mediana * 100)}% · fascia ${num(v.relativa.q25 * 100)}%–${num(v.relativa.q75 * 100)}%`,
        v.valuta
          ? `in valuta: ${num(v.valuta.mediana, v.decimaliPrezzo)}${v.unita} (${num(v.valuta.q25, v.decimaliPrezzo)}–${num(v.valuta.q75, v.decimaliPrezzo)})`
          : `in valuta: non disponibile (${v.motivoValutaAssente})`,
      ];
    case "termometro_affidabilita":
      return [
        `esito "${v.esitoAtteso}" nel ${pct(v.quota)} dei casi · senza il termometro ${pct(v.baseRate)} · differenza ${num(v.guadagnoPp, 1)} punti · n=${v.n} (${v.calcolataDa} → ${v.calcolataFinoA})`,
        v.persistenza
          ? `lo stato resta invariato nel ${pct(v.persistenza.quotaInvariati)} dei giorni · durata media ${num(v.persistenza.durataMediaGiorni, 1)} giorni`
          : "persistenza dello stato non calcolabile",
      ];
    case "iv":
      return [
        `${v.etichetta}${v.proxy ? " (sostituto dichiarato)" : ""} a ${num(v.livello)}`,
        `posizione nella propria storia: 1A ${v.pct1 ?? "—"} · 3A ${v.pct3 ?? "—"} · 5A ${v.pct5 ?? "—"} su 100`,
        `variazione: 1 settimana ${v.var1S === null ? "—" : num(v.var1S)} · 1 mese ${v.var1M === null ? "—" : num(v.var1M)}`,
      ];
    case "cot":
      return [
        `${v.metrica === "open_interest" ? "partecipazione" : "posizionamento netto dei fondi"}: banda ${v.banda} · ${num(v.posizioneBarra, 1)} su 100 (dal ${v.annoInizio}, ${v.settimane} settimane)`,
        `variazione nelle ultime 4 settimane: ${v.delta4Settimane === null ? "—" : v.delta4Settimane}`,
      ];
    case "dispersione":
      return [
        `${v.granularita === "MESE" ? "mese" : "giorno"} «${v.bucket}» · dispersione ${v.stdevPct === null ? "—" : `${num(v.stdevPct)} punti`} · fascia 25°–75° larga ${num(v.iqrPct)} punti`,
        `campione: ${v.n} anni (${v.primoAnno}–${v.ultimoAnno}, finestra ${v.anniFinestra}a) · qualità ${v.quality}`,
      ];
    case "iv_mese":
      return [
        `${v.etichetta}${v.proxy ? " (sostituto)" : ""} in ${v.mese}: livello medio ${num(v.media)} su ${v.n} anni (finestra ${v.anniFinestra}a, qualità ${v.quality})`,
      ];
    case "stabilita":
      return [
        `legame con pari e driver: ${num(v.percentileMediano, 0)} su 100 (banda ${v.banda}) su ${v.nRelazioni} confronti · dal ${v.annoInizio}, ${v.sedute} sedute`,
      ];
    case "livello_trends":
      return [
        `${v.etichetta}: ${num(v.livello, v.decimali)}${v.unita} · posizione storica ${v.percentile ?? "—"} su 100 · 1 settimana ${v.var1S === null ? "—" : num(v.var1S, v.decimali)}`,
      ];
  }
}

function stampa(d: Dossier, etichetta: string): void {
  console.log("");
  console.log("═".repeat(78));
  console.log(`  ${etichetta}  ·  giorno ${d.giorno}`);
  console.log("═".repeat(78));
  console.log(
    `  CARATTERE: ${ETICHETTA_CARATTERE[d.carattereAtteso]}   ·   CONFIDENZA: ${d.confidenza}`,
  );
  console.log(`  ${d.motivoConfidenza}`);
  console.log(
    `  copertura: ${d.presenti}/${d.attesiApplicabili} (${pct(d.copertura)})` +
      `${d.discordanza ? " · LETTURE DISCORDI" : ""}` +
      `${d.datiInsufficienti ? "  ⚠ DATI INSUFFICIENTI" : ""}`,
  );
  if (d.motivoInsufficienza) console.log(`  ⚠ ${d.motivoInsufficienza}`);
  console.log(`  dato più vecchio usato: ${d.datoPiuVecchio ?? "—"}`);
  console.log("");

  console.log("  ── FATTORI PRESENTI ──");
  if (d.fattori.length === 0) console.log("    (nessuno)");
  for (const f of d.fattori) {
    console.log(
      `  [${f.id}] ${f.nome}  (classe ${f.classe} · peso ${f.peso} · ${f.dataDato}, ${f.giorniEta}gg, ${f.freschezza})`,
    );
    for (const riga of descrivi(f)) console.log(`        ${riga}`);
  }

  console.log("");
  console.log("  ── FATTORI ASSENTI ──");
  if (d.assenti.length === 0) console.log("    (nessuno)");
  for (const a of d.assenti) {
    console.log(
      `  [${a.id}] ${a.nome} → ${ETICHETTA_ASSENZA[a.motivo]}${a.applicabile ? "" : "  (fuori dal conteggio)"}`,
    );
  }

  console.log("");
  console.log("  ── SEZIONI LETTE ──");
  for (const f of d.fonti) console.log(`  · ${f.sezione} — dato al ${f.dataDato}`);
}

/** Finge che il report in archivio sia di oggi. NON tocca il database. */
function conReportFresco(fonti: FontiCondivise, giorno: string): FontiCondivise {
  if (!fonti.report) return fonti;
  return { ...fonti, report: { ...fonti.report, reportDate: giorno } };
}

async function main() {
  const giorno = giornoRoma();
  const reali = await caricaFontiCondivise();
  const fonti = reportFresco ? conReportFresco(reali, giorno) : reali;

  if (reportFresco) {
    console.log("");
    console.log("!".repeat(78));
    console.log(
      "  SIMULAZIONE: il report in archivio è del " +
        `${reali.report?.reportDate ?? "—"}, qui viene DATATO ${giorno}.`,
    );
    console.log(
      "  Serve solo a mostrare l'aspetto del dossier con un report giornaliero",
    );
    console.log("  fresco. I valori sono quelli veri di quel report.");
    console.log("!".repeat(78));
  }

  const dossier: Dossier[] = [];
  for (const def of AI_ANALYST_LIST) {
    const letture = await caricaLetture(def.code, giorno, fonti);
    dossier.push(buildDossier(def.code, giorno, letture));
  }

  if (soloJson) {
    console.log(JSON.stringify(dossier, null, 2));
    return;
  }
  for (let i = 0; i < dossier.length; i += 1) {
    stampa(dossier[i], `${AI_ANALYST_LIST[i].label} (${AI_ANALYST_LIST[i].ticker})`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
