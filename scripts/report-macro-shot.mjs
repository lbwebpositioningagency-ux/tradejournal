/**
 * Screenshot dell'anteprima statica del dettaglio report Macro Desk.
 *
 * Perché non `scripts/shot.mjs`: quello fotografa l'app vera dietro login e
 * prima di scattare naviga sull'`origin` per impostare il tema — con un file
 * locale l'origin è `null` e Chrome rifiuta la navigazione. Stessa scelta già
 * fatta per `ai-analyst-shot.mjs`.
 *
 * Una foto per SEZIONE dell'anteprima (una per caso reale), ritagliata sul
 * riquadro della sezione: una pagina unica sarebbe alta diverse migliaia di
 * pixel e illeggibile.
 *
 *   npm run build
 *   ALLOW_REMOTE_DB=1 npx tsx scripts/report-macro-anteprima-html.tsx
 *   node scripts/report-macro-shot.mjs [--width 1280]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchChrome, sleep } from "./cdp.mjs";

const OUT = "docs/macro-desk-report-2tab";
const FILE = "anteprima.html";
/** Oltre questa altezza Chrome smette di comporre il frame in un colpo solo. */
const ALTEZZA_MAX = 15000;

function parseWidth(argv) {
  const i = argv.indexOf("--width");
  return i === -1 ? 1280 : Number(argv[i + 1]);
}

async function main() {
  const larghezza = parseWidth(process.argv);
  await mkdir(OUT, { recursive: true });
  const { client, dispose } = await launchChrome({ width: larghezza, height: 1000 });
  try {
    const url = pathToFileURL(join(process.cwd(), OUT, FILE)).href;
    await client.send("Page.navigate", { url });
    await sleep(1500);

    const { result } = await client.send("Runtime.evaluate", {
      expression: `JSON.stringify([...document.querySelectorAll('section.anteprima')].map((s) => {
        const r = s.getBoundingClientRect();
        return { id: s.id, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
      }))`,
      returnByValue: true,
    });
    const sezioni = JSON.parse(result.value);
    if (sezioni.length === 0) throw new Error("nessuna sezione nell'anteprima");

    for (const s of sezioni) {
      const altezza = Math.min(Math.ceil(s.h), ALTEZZA_MAX);
      const shot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: {
          x: Math.floor(s.x),
          y: Math.floor(s.y),
          width: Math.ceil(s.w),
          height: altezza,
          scale: 1,
        },
      });
      const dest = join(OUT, `${s.id}__${larghezza}.png`);
      await writeFile(dest, Buffer.from(shot.data, "base64"));
      console.log("scritto", dest, `${Math.ceil(s.w)}x${altezza}`);
    }
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
