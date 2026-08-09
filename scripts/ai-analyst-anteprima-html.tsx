/**
 * Anteprima VISIVA della sezione AI Analyst, come file HTML autonomo.
 *
 * Perché non uno screenshot della pagina vera: la pagina sta dietro
 * l'autenticazione, e in questa sessione non si possono inserire credenziali.
 * Questo script rende lo STESSO componente della pagina con lo STESSO CSS
 * compilato dal build, così la resa (colori, tipografia, spaziature, tema
 * chiaro e scuro) è quella reale. Restano fuori solo la sidebar e
 * l'intestazione di pagina.
 *
 *   npm run build                                   # serve il CSS compilato
 *   npx tsx scripts/ai-analyst-anteprima-html.ts    # scrive i due file
 *
 * Output: docs/ai-analyst/anteprima-<strumento>.html
 */

import "dotenv/config";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AiAnalystView } from "@/components/macro-desk/ai-analyst-view";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import { AI_ANALYST_LIST } from "@/lib/ai-analyst/instruments";
import { generaSintesi } from "@/lib/ai-analyst/sintesi";
import type { SintesiAiAnalyst } from "@/lib/ai-analyst/sintesi";
import {
  caricaFontiCondivise,
  caricaLetture,
  giornoRoma,
} from "@/lib/queries/ai-analyst";
import { prisma } from "@/lib/db";

const reportFresco = process.argv.includes("--report-fresco");

/** Il chunk CSS del build che contiene i token del terminale Macro Desk. */
function cssDelBuild(): string {
  const dir = join(process.cwd(), ".next", "static", "chunks");
  for (const nome of readdirSync(dir)) {
    if (!nome.endsWith(".css")) continue;
    const testo = readFileSync(join(dir, nome), "utf8");
    if (testo.includes("--md-surface")) return testo;
  }
  throw new Error(
    "CSS compilato non trovato: lancia prima `npm run build`.",
  );
}

function pagina(css: string, blocchi: { titolo: string; html: string }[]): string {
  return `<!doctype html>
<html lang="it" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Analyst — anteprima</title>
<style>${css}</style>
<style>
  /* Nella pagina vera le due famiglie arrivano da next/font (Inter e
     JetBrains Mono) come variabili sul contenitore. Qui non c'è next/font:
     senza questi fallback il terminale finirebbe fotografato in serif, che
     non è come si vede nell'app. */
  :root { --md-font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
          --md-font-mono: ui-monospace, "Cascadia Mono", "Consolas", monospace; }
  body { margin: 0; padding: 24px; background: var(--background); color: var(--foreground);
         font-family: var(--md-font-ui); }
  .anteprima { max-width: 1100px; margin: 0 auto 48px; }
  .anteprima > h2 { font: 600 14px/1.3 system-ui, sans-serif; text-transform: uppercase;
    letter-spacing: .14em; opacity: .6; margin: 0 0 10px; }
</style>
</head>
<body>
${blocchi
  .map(
    (b) => `<section class="anteprima">
  <h2>${b.titolo}</h2>
  <div class="macro-report" style="border:1px solid var(--md-border);border-radius:var(--md-r-lg);overflow:hidden">
    ${b.html}
  </div>
</section>`,
  )
  .join("\n")}
</body>
</html>`;
}

async function main() {
  const css = cssDelBuild();
  const giorno = giornoRoma();
  const reali = await caricaFontiCondivise();
  const fonti =
    reportFresco && reali.report
      ? { ...reali, report: { ...reali.report, reportDate: giorno } }
      : reali;

  const blocchi: { titolo: string; html: string }[] = [];
  for (const def of AI_ANALYST_LIST) {
    const letture = await caricaLetture(def.code, giorno, fonti);
    const dossier = buildDossier(def.code, giorno, letture);
    const sintesi: SintesiAiAnalyst = await generaSintesi(dossier, {
      generaJson: async () => {
        throw new Error("anteprima statica: nessuna chiamata al modello");
      },
      cancelloSemantico: async () => "no",
    });
    blocchi.push({
      titolo: `${def.label} (${def.ticker})`,
      html: renderToStaticMarkup(
        <AiAnalystView sintesi={sintesi} strumento={def.code} />,
      ),
    });
  }

  const dir = join(process.cwd(), "docs", "ai-analyst");
  mkdirSync(dir, { recursive: true });
  const nome = reportFresco ? "anteprima-report-fresco.html" : "anteprima.html";
  const file = join(dir, nome);
  writeFileSync(file, pagina(css, blocchi), "utf8");
  console.log(`scritto: ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
