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
import { ASSET_PAYLOAD_A_RECORD, parseMonitor } from "../src/lib/macro-desk-bias-record";
import type { MonitorConfidenza } from "../src/lib/macro-desk-confidenza";
import { controllaContratto } from "../src/lib/macro-desk-contratto";
import { MacroReportDetail } from "../src/components/macro-desk/report-detail";
import { RigaRevisione } from "../src/components/macro-desk/riga-revisione";
import { revisioneDaDire } from "../src/lib/macro-desk-versioni";
import { NewsTab, type NaturaBias } from "../src/components/macro-desk/report-tabs";

const prisma = new PrismaClient({
  adapter: guardedPgAdapter("report-macro-anteprima"),
});

/**
 * I casi da guardare, scelti sui difetti trovati nelle indagini del 28/08.
 * `monitorFinto` esiste per un caso solo: i campi nuovi della confidenza sono
 * stati ordinati al generatore oggi e in Neon non è ancora arrivato un report
 * che li porti. Il payload resta REALE, si aggiunge soltanto il blocco
 * `monitor` che il desk manderà — ed è dichiarato come simulato nel titolo,
 * perché un'anteprima che finge di essere un dato di produzione è peggio di
 * nessuna anteprima.
 */
const CASI: {
  data: string;
  nota: string;
  news?: string;
  titolo?: string;
  monitorFinto?: Record<string, MonitorConfidenza>;
  /** Ricostruisce una versione precedente per far comparire la riga. */
  revisioneFinta?: boolean;
}[] = [
  {
    data: "2026-08-28",
    news: "Titoli cliccabili quando c'è l'url, date ancorate al giorno del report, chip dell'asset non ripetuto sotto il suo gruppo",
    nota:
      "DAILY v3 REALE · oro e indici dichiarano il taglio della confidenza (euristica) · PETROLIO: 3 pilastri su 4 ribassisti con bias NEUTRALE (caso limite)",
  },
  {
    data: "2026-08-28",
    titolo: "2026-08-28 · DAILY · CAMPI NUOVI (monitor simulato)",
    nota:
      "Stesso payload reale, più il blocco `monitor` che il generatore manderà da oggi: due numeri quando impegno e lettura di oggi divergono, e il motivo DICHIARATO reso DENTRO il pilastro cui `confPilastro` lo assegna, non in un blocco staccato",
    monitorFinto: {
      gold: {
        confidenceOggi: 44,
        confMotivo:
          "keynote Warsh alle 16:00 è un bivio binario: fino a quel momento la lettura vale meno di quanto valesse domenica",
        confPilastro: "eventi",
        state: "conferma",
        note: "Oro sui massimi ~3 mesi; PCE core in linea ha ridotto le odds di rialzo Fed a ~34%. Warsh oggi il bivio.",
      },
      oil: {
        confidenceOggi: 44,
        confMotivo: "ramo b1 a un soffio (81,85 contro 81,0): la lettura è appesa a una chiusura",
        confPilastro: "tattico",
        state: "stress",
        note: "Scivola verso il ramo b1<81 (unwind Hormuz + tagli domanda IEA/OPEC); a 81,85 ancora in banda neutrale.",
      },
      idx: {
        confidenceOggi: 46,
        confMotivo: "breadth negativa con indice in tenuta: due segnali opposti",
        confPilastro: "pricing",
        state: "conferma",
        note: "Nvidia blowout toglie il rischio-coda AI ma breadth negativa; ramo b1>7.843 armato non scattato.",
      },
    },
  },
  {
    data: "2026-08-28",
    titolo: "2026-08-28 · DAILY · SCOSTAMENTO NON MOTIVATO (monitor simulato)",
    nota:
      "Il report cambia la confidenza senza dichiarare perché: dal 28/08 è una violazione del contratto, e la card la DICE invece di tacere. I due numeri restano visibili",
    monitorFinto: {
      gold: { confidenceOggi: 44, state: "conferma", note: "Oro sui massimi ~3 mesi." },
      oil: { confidenceOggi: 38, state: "stress", note: "Scivola verso il ramo b1<81." },
      idx: { confidenceOggi: 52, state: "conferma", note: "Nvidia toglie il rischio-coda AI." },
    },
  },
  {
    data: "2026-08-28",
    titolo: "2026-08-28 · DAILY · RIGA DELLA REVISIONE (coppia ricostruita)",
    nota:
      "La versione delle 04:22 è stata cancellata dall'upsert PRIMA che il journal esistesse, e non si può recuperare: qui la si ricostruisce cambiando un solo bias, per vedere la riga nel posto in cui compare davvero. Il payload della versione corrente è REALE",
    revisioneFinta: true,
  },
  {
    data: "2026-08-16",
    nota: "WEEKLY REALE · bias EMESSO in questo report (non monitorato)",
  },
  {
    data: "2026-08-18",
    nota:
      "DAILY REALE · Radar rischi e Verdetto TORNATI: arrivavano in `risk`/`concl` e il parser non li leggeva",
    news:
      "LE 11 CARD MUTE: tutte le notizie di questo report usano `t`/`note` invece di `title`/`impl`. Da oggi il parser li legge come alias e le card parlano",
  },
  {
    data: "2026-07-31",
    nota:
      "DAILY v1 REALE · `synthesis` era una STRINGA e cadeva intera: ora vale come Verdetto. Bias AGGIORNATO dal giornaliero",
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

function pagina(
  css: string,
  blocchi: { titolo: string; nota: string; html: string; intestazione?: string }[],
) {
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
  /* L'intestazione della PAGINA (fuori dal terminale): qui serve solo a
     mostrare la riga della revisione nel contesto in cui compare davvero. */
  .intestazione { margin: 0 0 10px; color: #e6e9ef; font: 400 13px/1.5 system-ui, sans-serif; }
  .intestazione .text-muted-foreground { color: #9aa4b2; }
  .intestazione .text-foreground { color: #e6e9ef; }
  .intestazione .font-semibold { font-weight: 600; }
  .intestazione .text-xs { font-size: 12px; }
</style>
</head>
<body>
${blocchi
  .map(
    (b) => `<section class="anteprima" id="${b.titolo.replace(/[^\w-]/g, "-")}">
  <h2>${b.titolo}</h2>
  <p>${b.nota}</p>
  ${b.intestazione ? `<div class="intestazione">${b.intestazione}</div>` : ""}
  <div class="md-listino" style="border:1px solid var(--ml-rule, var(--md-border));overflow:hidden">
    ${b.html}
  </div>
</section>`,
  )
  .join("\n")}
</body>
</html>`;
}

function monitorReale(colonna: unknown): Record<string, MonitorConfidenza> {
  const perChiave = new Map(parseMonitor(colonna).map((m) => [m.asset, m]));
  const fuori: Record<string, MonitorConfidenza> = {};
  for (const [id, chiave] of Object.entries(ASSET_PAYLOAD_A_RECORD)) {
    const m = perChiave.get(chiave);
    if (!m) continue;
    if (m.confidenceOggi === null && m.confMotivo === null && m.state === null && m.note === null) {
      continue;
    }
    fuori[id] = {
      confidenceOggi: m.confidenceOggi,
      confMotivo: m.confMotivo,
      confPilastro: m.confPilastro,
      state: m.state,
      note: m.note,
    };
  }
  return fuori;
}

function natura(type: string, schemaVersion: number | null): NaturaBias {
  if (type === "WEEKLY") return "emesso";
  return (schemaVersion ?? 0) >= 2 ? "monitorato" : "aggiornato";
}

async function main() {
  const css = cssDelBuild();
  const blocchi: {
    titolo: string;
    nota: string;
    html: string;
    intestazione?: string;
  }[] = [];

  for (const caso of CASI) {
    /* `select` ESPLICITO e non `findFirst` nudo: la colonna
       `rilieviContratto` esiste in locale (migrazione applicata) ma non ancora
       su Neon, dove la migrazione arriva col deploy. Chiedere tutte le colonne
       farebbe fallire l'anteprima sui dati veri per una colonna che
       all'anteprima non serve. */
    const report = await prisma.macroDeskReport.findFirst({
      where: { reportDate: new Date(`${caso.data}T00:00:00.000Z`) },
      orderBy: { type: "asc" },
      select: {
        type: true,
        reportDate: true,
        schemaVersion: true,
        payload: true,
        monitor: true,
        biasRecord: true,
      },
    });
    if (!report) {
      console.warn(`report ${caso.data} non trovato: saltato`);
      continue;
    }
    const payload = parseMacroPayload(report.payload);
    const n = natura(report.type, report.schemaVersion);
    const monitor = caso.monitorFinto ?? monitorReale(report.monitor);

    /* La coppia di versioni: la corrente è il payload VERO, la precedente si
       ricostruisce cambiando un bias — quella originale è stata cancellata
       dall'upsert prima che il journal esistesse, ed è esattamente il buco che
       il journal chiude da oggi in avanti. */
    let intestazione: string | undefined;
    if (caso.revisioneFinta) {
      const grezzo = report.payload as { assets?: { id?: string; weekly?: { biasLabel?: string } }[] };
      const precedente = JSON.parse(JSON.stringify(grezzo)) as typeof grezzo;
      const oil = precedente.assets?.find((a) => a.id === "oil");
      if (oil?.weekly) oil.weekly.biasLabel = "RIBASSISTA";
      const revisione = revisioneDaDire(
        2,
        { arrivatoIl: new Date("2026-08-28T09:43:28Z"), payload: precedente },
        { arrivatoIl: new Date("2026-08-28T14:59:24Z"), payload: report.payload },
      );
      intestazione = renderToStaticMarkup(
        <>
          <p className="page-subtitle">
            Venerdì 28 agosto 2026 · generato 28/08/2026, 16:46
          </p>
          <RigaRevisione revisione={revisione} timezone="Europe/Rome" />
        </>,
      );
    }

    blocchi.push({
      titolo: caso.titolo ?? `${caso.data} · ${report.type} · tab ASSET`,
      nota: caso.nota,
      intestazione,
      html: renderToStaticMarkup(
        <MacroReportDetail
          payload={payload}
          natura={n}
          monitor={monitor}
          reportDate={report.reportDate}
          /* I rilievi si CALCOLANO sul payload vero invece di leggerli dalla
             colonna: i 23 report in archivio sono entrati prima che la
             sentinella esistesse, e la loro colonna è vuota. È lo stesso
             risultato che avrebbero avuto arrivando oggi. */
          rilievi={controllaContratto(report.payload, report.biasRecord)}
        />,
      ),
    });
    if (caso.news) {
      blocchi.push({
        titolo: `${caso.data} · ${report.type} · tab NEWS`,
        nota: caso.news,
        html: renderToStaticMarkup(
          <div className="flex flex-col gap-5 p-4 sm:p-6">
            <NewsTab payload={payload} reportDate={report.reportDate} />
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
