/**
 * Screenshot dell'anteprima statica dell'AI Analyst.
 *
 * Perché uno script a parte invece di `scripts/shot.mjs`: quello fotografa
 * l'app vera dietro login, e prima di scattare naviga sull'`origin` per
 * impostare il tema — con un file locale l'origin è `null` e Chrome rifiuta la
 * navigazione. Qui il file è già autonomo (CSS del build incluso) e il tema si
 * cambia con una classe sull'elemento radice.
 *
 *   npm run build
 *   npx tsx scripts/ai-analyst-anteprima-html.tsx --report-fresco
 *   node scripts/ai-analyst-shot.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchChrome, sleep } from "./cdp.mjs";

const OUT = "docs/ai-analyst";
const SORGENTI = [
  ["anteprima.html", "ai-analyst"],
  ["anteprima-report-fresco.html", "ai-analyst-report-fresco"],
];
const TEMI = ["dark", "light"];
const LARGHEZZE = [1280, 390];

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const larghezza of LARGHEZZE) {
    const { client, dispose } = await launchChrome({
      width: larghezza,
      height: 1000,
    });
    try {
      for (const [file, nome] of SORGENTI) {
        const url = pathToFileURL(join(process.cwd(), OUT, file)).href;
        await client.send("Page.navigate", { url });
        await sleep(1500);
        for (const tema of TEMI) {
          await client.send("Runtime.evaluate", {
            expression: `document.documentElement.classList.toggle('dark', ${tema === "dark"})`,
          });
          await sleep(400);
          const metrics = await client.send("Page.getLayoutMetrics");
          const shot = await client.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: true,
            clip: {
              x: 0,
              y: 0,
              width: larghezza,
              height: Math.ceil(metrics.cssContentSize.height),
              scale: 1,
            },
          });
          const dest = join(OUT, `${nome}__${larghezza}__${tema}.png`);
          await writeFile(dest, Buffer.from(shot.data, "base64"));
          console.log("scritto", dest);
        }
      }
    } finally {
      await dispose();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
