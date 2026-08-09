/**
 * Prova di RIPETIBILITÀ: N generazioni vere sullo STESSO identico dossier.
 *
 * Serve a verificare l'invariante che regge tutta la sezione: il carattere
 * della giornata e la fiducia NON li decide il modello, li calcola il nostro
 * codice dal dossier. Devono quindi restare identici a ogni chiamata. Se
 * cambiano è un bug, non «normale variabilità dell'AI».
 *
 * La prosa può variare nella forma; questo script la stampa tutta e riporta
 * quanto le generazioni si somigliano, così la variazione si valuta a occhio
 * invece che a sensazione.
 *
 *   npx tsx scripts/ai-analyst-ripetibilita.ts [--strumento ORO] [--giri 5]
 *                                              [--report-fresco]
 */

import "./ai-analyst-env";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import {
  parseAiAnalystInstrument,
  AI_ANALYST_DEFS,
} from "@/lib/ai-analyst/instruments";
import { generaJsonGemini } from "@/lib/ai-analyst/gemini";
import { generaSintesi } from "@/lib/ai-analyst/sintesi";
import type { SintesiAiAnalyst } from "@/lib/ai-analyst/sintesi";
import { cancelloSemanticoGemini } from "@/lib/cot-contesto-gemini";
import {
  caricaFontiCondivise,
  caricaLetture,
  giornoRoma,
} from "@/lib/queries/ai-analyst";
import { prisma } from "@/lib/db";

function arg(nome: string, difetto: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : difetto;
}

const strumento = parseAiAnalystInstrument(arg("strumento", "ORO"));
const giri = Number(arg("giri", "5"));
const reportFresco = process.argv.includes("--report-fresco");
/** Stessa ragione dello script di sintesi: non farsi limitare al minuto. */
const PAUSA_MS = 13_000;
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Quota di parole in comune fra due testi (indice di Jaccard, 0-1). */
function somiglianza(a: string, b: string): number {
  const parole = (t: string) =>
    new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const A = parole(a);
  const B = parole(b);
  if (A.size === 0 && B.size === 0) return 1;
  let comuni = 0;
  for (const p of A) if (B.has(p)) comuni += 1;
  return comuni / (A.size + B.size - comuni);
}

function testoDi(s: SintesiAiAnalyst): string {
  return [...s.apertura, ...s.fattori.map((f) => f.oggi), ...s.cosaNonSappiamo].join(
    "\n",
  );
}

async function main() {
  const giorno = giornoRoma();
  const reali = await caricaFontiCondivise();
  const fonti =
    reportFresco && reali.report
      ? { ...reali, report: { ...reali.report, reportDate: giorno } }
      : reali;

  const letture = await caricaLetture(strumento, giorno, fonti);
  const dossier = buildDossier(strumento, giorno, letture);

  console.log(
    `\nStesso dossier, ${giri} generazioni: ${AI_ANALYST_DEFS[strumento].label} · ${giorno}` +
      `${reportFresco ? " · report datato a oggi (SIMULAZIONE)" : ""}`,
  );
  console.log(
    `Verdetto calcolato dal nostro codice: ${dossier.carattereAtteso} · ${dossier.confidenza}\n`,
  );

  const esiti: SintesiAiAnalyst[] = [];
  for (let i = 1; i <= giri; i += 1) {
    if (i > 1) await attendi(PAUSA_MS);
    const t0 = Date.now();
    const s = await generaSintesi(dossier, {
      generaJson: generaJsonGemini,
      cancelloSemantico: cancelloSemanticoGemini,
    });
    esiti.push(s);
    console.log(
      `── giro ${i}: ${s.origine} · ${s.carattereAtteso} · ${s.confidenza} · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    console.log(`   tracciato: ${s.eventi.join(" | ")}`);
    for (const frase of s.apertura) console.log(`   A| ${frase}`);
    const aggiunte = s.cosaNonSappiamo.slice(3);
    for (const v of aggiunte) console.log(`   L| ${v}`);
  }

  console.log("\n── VERDETTO: resta identico? ──");
  const caratteri = new Set(esiti.map((s) => s.carattereAtteso));
  const confidenze = new Set(esiti.map((s) => s.confidenza));
  const motivi = new Set(esiti.map((s) => s.motivoConfidenza));
  console.log(`  carattere: ${[...caratteri].join(", ")} → ${caratteri.size === 1 ? "IDENTICO" : "⚠ CAMBIA"}`);
  console.log(`  confidenza: ${[...confidenze].join(", ")} → ${confidenze.size === 1 ? "IDENTICA" : "⚠ CAMBIA"}`);
  console.log(`  motivo: ${motivi.size === 1 ? "IDENTICO" : "⚠ CAMBIA"}`);

  console.log("\n── PROSA: quanto si somigliano i giri ──");
  const testi = esiti.map(testoDi);
  const identici = new Set(testi).size === 1;
  console.log(`  testo integrale identico in tutti i giri: ${identici ? "SÌ" : "no"}`);
  for (let i = 1; i < testi.length; i += 1) {
    console.log(
      `  giro 1 vs giro ${i + 1}: parole in comune ${(somiglianza(testi[0], testi[i]) * 100).toFixed(1)}%`,
    );
  }

  const aperture = new Set(esiti.map((s) => s.apertura.join(" ")));
  const righe = new Set(esiti.map((s) => s.fattori.map((f) => f.oggi).join(" ")));
  console.log(`  aperture diverse fra loro: ${aperture.size} su ${giri}`);
  console.log(`  insiemi di righe-fattore diversi fra loro: ${righe.size} su ${giri}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
