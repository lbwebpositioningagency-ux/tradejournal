/**
 * Genera e stampa la SINTESI reale dell'AI Analyst per ogni strumento, sui
 * dati locali e con una chiamata vera a Gemini (o con il fallback, se la
 * chiave manca o la quota è finita — che è esattamente ciò che deve succedere).
 *
 *   npx tsx scripts/ai-analyst-sintesi.ts
 *   npx tsx scripts/ai-analyst-sintesi.ts --report-fresco   # come sopra, ma
 *       finge che il report in archivio sia di oggi (SIMULAZIONE dichiarata)
 *   npx tsx scripts/ai-analyst-sintesi.ts --senza-modello   # solo fallback
 */

import "./ai-analyst-env";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import { AI_ANALYST_LIST } from "@/lib/ai-analyst/instruments";
import { generaJsonGemini, haChiaveGemini } from "@/lib/ai-analyst/gemini";
import { generaSintesi, type DipendenzeSintesi } from "@/lib/ai-analyst/sintesi";
import {
  ETICHETTA_ASSENZA,
  ETICHETTA_CARATTERE,
  ETICHETTA_CONFIDENZA,
} from "@/lib/ai-analyst/types";
import type { SintesiAiAnalyst } from "@/lib/ai-analyst/sintesi";
import { cancelloSemanticoGemini } from "@/lib/cot-contesto-gemini";
import {
  caricaFontiCondivise,
  caricaLetture,
  giornoRoma,
} from "@/lib/queries/ai-analyst";
import { prisma } from "@/lib/db";

const reportFresco = process.argv.includes("--report-fresco");
const senzaModello = process.argv.includes("--senza-modello");

/**
 * Pausa fra uno strumento e l'altro. Il tier gratuito limita le richieste al
 * MINUTO, e una sintesi ne fa tre (generazione + le due domande del cancello
 * semantico): senza pausa quattro strumenti di fila sfiorerebbero il limite e
 * un 429 verrebbe scambiato per «il modello non è raggiungibile», falsando
 * proprio la misura che questo script serve a fare. Vive solo qui: l'app
 * genera uno strumento alla volta, su richiesta.
 */
const PAUSA_MS = 12_000;
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Contatore e cronometro delle chiamate reali: servono al verbale (§4 e §5). */
const chiamate: { tipo: string; ms: number }[] = [];

async function cronometra<T>(tipo: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    chiamate.push({ tipo, ms: Date.now() - t0 });
  }
}

const depsReali: DipendenzeSintesi = {
  generaJson: (p) => cronometra("generazione", () => generaJsonGemini(p)),
  cancelloSemantico: (d, t) =>
    cronometra("cancello", () => cancelloSemanticoGemini(d, t)),
};

const depsSenzaModello: DipendenzeSintesi = {
  generaJson: async () => {
    throw new Error("esecuzione richiesta senza modello");
  },
  cancelloSemantico: async () => "no",
};

function stampa(s: SintesiAiAnalyst, etichetta: string): void {
  console.log("");
  console.log("═".repeat(78));
  console.log(`  ${etichetta}  ·  ${s.giorno}`);
  console.log("═".repeat(78));
  console.log(
    `  ORIGINE: ${s.origine.toUpperCase()}${s.motivoFallback ? ` (${s.motivoFallback})` : ""}`,
  );
  console.log(
    `  CARATTERE DELLA GIORNATA: ${ETICHETTA_CARATTERE[s.carattereAtteso]}`,
  );
  console.log(
    `  FIDUCIA NELLA LETTURA: ${ETICHETTA_CONFIDENZA[s.confidenza]} — ${s.motivoConfidenza}`,
  );
  if (s.datiInsufficienti) console.log("  ⚠ DATI INSUFFICIENTI");
  console.log("");
  for (const frase of s.apertura) console.log(`  ${frase}`);
  console.log("");
  console.log("  ── COSA HA PESATO ──");
  for (const f of s.fattori) {
    console.log(
      `  • ${f.nome} [peso ${f.peso}${f.freschezza === "invecchiato" ? ", dato non dell'ultima seduta" : ""}]`,
    );
    console.log(`      ${f.oggi}`);
  }
  if (s.fattoriAssenti.length > 0) {
    console.log("");
    console.log("  ── COSA NON C'ERA ──");
    for (const a of s.fattoriAssenti) {
      console.log(`  • ${a.nome} — ${ETICHETTA_ASSENZA[a.motivo]}`);
    }
  }
  console.log("");
  console.log("  ── COSA QUESTA LETTURA NON DICE ──");
  for (const v of s.cosaNonSappiamo) console.log(`  • ${v}`);
  console.log("");
  console.log("  ── SEZIONI LETTE ──");
  for (const f of s.fonti) console.log(`  · ${f.sezione} — dato al ${f.dataDato}`);
  console.log(`  Dato più vecchio usato: ${s.datoPiuVecchio ?? "—"}`);
  console.log("");
  console.log(`  [tracciato: ${s.eventi.join(" | ")}]`);
}

async function main() {
  const giorno = giornoRoma();
  const reali = await caricaFontiCondivise();
  const fonti =
    reportFresco && reali.report
      ? { ...reali, report: { ...reali.report, reportDate: giorno } }
      : reali;

  if (reportFresco) {
    console.log("");
    console.log("!".repeat(78));
    console.log(
      `  SIMULAZIONE: il report in archivio è del ${reali.report?.reportDate ?? "—"}, qui viene DATATO ${giorno}.`,
    );
    console.log("  I valori sono quelli veri di quel report.");
    console.log("!".repeat(78));
  }
  console.log(
    `\n[modello: ${senzaModello ? "disattivato da riga di comando" : haChiaveGemini() ? "Gemini flash-lite, chiave presente" : "nessuna chiave, si userà il fallback"}]`,
  );

  let primo = true;
  for (const def of AI_ANALYST_LIST) {
    if (!primo && !senzaModello) await attendi(PAUSA_MS);
    primo = false;
    const letture = await caricaLetture(def.code, giorno, fonti);
    const dossier = buildDossier(def.code, giorno, letture);
    const t0 = Date.now();
    const sintesi = await generaSintesi(
      dossier,
      senzaModello ? depsSenzaModello : depsReali,
    );
    const durata = Date.now() - t0;
    stampa(sintesi, `${def.label} (${def.ticker})`);
    console.log(`  [tempo totale della sintesi: ${(durata / 1000).toFixed(1)} s]`);
  }

  if (chiamate.length > 0) {
    const perTipo = new Map<string, number[]>();
    for (const c of chiamate) {
      const l = perTipo.get(c.tipo) ?? [];
      l.push(c.ms);
      perTipo.set(c.tipo, l);
    }
    console.log("");
    console.log("── CHIAMATE REALI AL MODELLO ──");
    for (const [tipo, ms] of perTipo) {
      const somma = ms.reduce((a, b) => a + b, 0);
      console.log(
        `  ${tipo}: ${ms.length} chiamate · media ${(somma / ms.length / 1000).toFixed(2)} s · min ${(Math.min(...ms) / 1000).toFixed(2)} s · max ${(Math.max(...ms) / 1000).toFixed(2)} s`,
      );
    }
    console.log(`  TOTALE: ${chiamate.length} chiamate in questa esecuzione`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
