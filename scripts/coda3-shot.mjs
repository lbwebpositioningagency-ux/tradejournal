/**
 * Screenshot mirato del widget SCORE, per il controllo visivo della coda 3.
 * Come `shot.mjs`, ma inquadra la CARD dello Score invece della finestra:
 * il widget è alto poco più di 200 px e in una schermata da 900 finiva
 * mezzo sotto l'intestazione sticky.
 *
 *   node scripts/coda3-shot.mjs <accountId> <nome> [periodo]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { launchChrome, login, setAccount, setTheme, sleep } from "./cdp.mjs";

const [, , account, name, period] = process.argv;
const OUT = "docs/audit/coda3";
const ORIGIN = "http://localhost:3100";

const { client, dispose } = await launchChrome({ width: 1280, height: 900 });
try {
  await login(client, ORIGIN, "demo@tradejournal.local:demo1234");
  await setAccount(client, ORIGIN, account);
  await setTheme(client, ORIGIN, "dark");
  const url = period
    ? `${ORIGIN}/dashboard?period=${period}`
    : `${ORIGIN}/dashboard`;
  await client.send("Page.navigate", { url });
  await client.send("Page.loadEventFired").catch(() => {});
  await sleep(6000);
  const { result } = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const card = [...document.querySelectorAll("[data-slot='card'], .md-card")]
        .find((c) => /^\s*SCORE/i.test(c.textContent || ""));
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return JSON.stringify({
        x: Math.max(0, r.x - 12), y: Math.max(0, r.y + window.scrollY - 12),
        width: r.width + 24, height: r.height + 24,
      });
    })()`,
    returnByValue: true,
  });
  if (!result.value) throw new Error("Card SCORE non trovata");
  const clip = { ...JSON.parse(result.value), scale: 2 };
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip,
    captureBeyondViewport: true,
  });
  await mkdir(OUT, { recursive: true });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  console.log(`scritto ${file}`);
} finally {
  await dispose();
}
