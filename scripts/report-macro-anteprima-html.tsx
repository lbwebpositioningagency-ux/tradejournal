/**
 * Anteprima VISIVA del dettaglio report Macro Desk, come file HTML autonomo.
 *
 * Perché non uno screenshot della pagina vera: la pagina sta dietro
 * l'autenticazione e i report reali stanno su Neon, non sul Postgres locale.
 * Questo script rende gli STESSI componenti della pagina con lo STESSO CSS
 * compilato dal build, sui report VERI in produzione — così l'autocontrollo
 * visivo guarda quello che vede l'utente, non un mock. Restano fuori solo la
 * sidebar e l'intestazione di pagina.
 *
 *   npm run build                                                # CSS compilato
 *   ALLOW_REMOTE_DB=1 npx tsx scripts/report-macro-anteprima-html.tsx
 *
 * SOLA LETTURA: nessuna scrittura sul database.
 * Output: docs/macro-desk-report-2tab/anteprima.html
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

const ENV_FILE = resolve(__dirname, "..", ".env.production.local");
const caricato = loadEnv({ path: ENV_FILE });
if (caricato.error) {
  console.error(`STOP: impossibile leggere ${ENV_FILE}: ${caricato.error.message}`);
  process.exit(1);
}

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PrismaClient } from "../src/generated/prisma/client";
import { guardedPgAdapter } from "../src/lib/db-guard";
import { parseMacroPayload } from "../src/lib/macro-desk-payload";
import { MacroReportDetail } from "../src/components/macro-desk/report-detail";
import { NewsTab, type NaturaBias } from "../src/components/macro-desk/report-tabs";

const prisma = new PrismaClient({
  adapter: guardedPgAdapter("report-macro-anteprima"),
});

/** I casi da guardare, scelti sui difetti trovati nell'indagine del 28/08. */
const CASI: { data: string; nota: string; news?: string }[] = [
  {
    data: "2026-08-28",
    news: "Il secondo dei due tab rimasti, invariato",
    nota:
      "DAILY v3 · oro e indici dichiarano il taglio della confidenza · PETROLIO: 3 pilastri su 4 ribassisti con bias NEUTRALE (caso limite)",
  },
  {
    data: "2026-08-16",
    nota: "WEEKLY · bias EMESSO in questo report (non monitorato)",
  },
  {
    data: "2026-08-18",
    nota: "DAILY senza verdetto e senza radar rischi: restano solo il quadro e le card",
    news:
      "DIFETTO DI SORGENTE: in questo report tutte e 11 le news usano `t`/`note` invece di `title`/`impl` — il parser non li legge e le card escono senza testo",
  },
  {
    data: "2026-07-31",
    nota:
      "DAILY v1 · nessuna sintesi (né quadro, né verdetto, né rischi) e bias AGGIORNATO dal giornaliero",
  },
];

/** Il chunk CSS del build che contiene i token del terminale Macro Desk. */
function cssDelBuild(): string {
  const dir = join(process.cwd(), ".next", "static", "chunks");
  for (const nome of readdirSync(dir)) {
    if (!nome.endsWith(".css")) continue;
    const testo = readFileSync(join(dir, nome), "utf8");
    if (testo.includes("--md-surface")) return testo;
  }
  throw new Error("CSS compilato non trovato: lancia prima `npm run build`.");
}

function pagina(css: string, blocchi: { titolo: string; nota: string; html: string }[]) {
  return `<!doctype html>
<html lang="it" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report Macro Desk — anteprima due tab</title>
<style>${css}</style>
<style>
  /* Nella pagina vera le due famiglie arrivano da next/font (Inter e
     JetBrains Mono) come variabili sul contenitore. Qui non c'è next/font:
     senza questi fallback il terminale finirebbe fotografato in serif. */
  :root { --md-font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
          --md-font-mono: ui-monospace, "Cascadia Mono", "Consolas", monospace; }
  body { margin: 0; padding: 24px; background: var(--background); color: var(--foreground);
         font-family: var(--md-font-ui); }
  .anteprima { max-width: 1180px; margin: 0 auto 56px; }
  .anteprima > h2 { font: 700 15px/1.3 system-ui, sans-serif; margin: 0 0 4px; }
  .anteprima > p { font: 400 12px/1.5 system-ui, sans-serif; opacity: .65; margin: 0 0 12px; }
</style>
</head>
<body>
${blocchi
  .map(
    (b) => `<section class="anteprima" id="${b.titolo.replace(/[^\w-]/g, "-")}">
  <h2>${b.titolo}</h2>
  <p>${b.nota}</p>
  <div class="macro-report" style="border:1px solid var(--md-border);border-radius:var(--md-r-lg);overflow:hidden">
    ${b.html}
  </div>
</section>`,
  )
  .join("\n")}
</body>
</html>`;
}

function natura(type: string, schemaVersion: number | null): NaturaBias {
  if (type === "WEEKLY") return "emesso";
  return (schemaVersion ?? 0) >= 2 ? "monitorato" : "aggiornato";
}

async function main() {
  const css = cssDelBuild();
  const blocchi: { titolo: string; nota: string; html: string }[] = [];

  for (const caso of CASI) {
    const report = await prisma.macroDeskReport.findFirst({
      where: { reportDate: new Date(`${caso.data}T00:00:00.000Z`) },
      orderBy: { type: "asc" },
    });
    if (!report) {
      console.warn(`report ${caso.data} non trovato: saltato`);
      continue;
    }
    const payload = parseMacroPayload(report.payload);
    const n = natura(report.type, report.schemaVersion);
    blocchi.push({
      titolo: `${caso.data} · ${report.type} · tab ASSET`,
      nota: caso.nota,
      html: renderToStaticMarkup(
        <MacroReportDetail payload={payload} natura={n} />,
      ),
    });
    if (caso.news) {
      blocchi.push({
        titolo: `${caso.data} · ${report.type} · tab NEWS`,
        nota: caso.news,
        html: renderToStaticMarkup(
          <div className="flex flex-col gap-5 p-4 sm:p-6">
            <NewsTab payload={payload} />
          </div>,
        ),
      });
    }
  }

  const dir = join(process.cwd(), "docs", "macro-desk-report-2tab");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "anteprima.html");
  writeFileSync(file, pagina(css, blocchi), "utf8");
  console.log(`scritto: ${file} (${blocchi.length} blocchi)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
