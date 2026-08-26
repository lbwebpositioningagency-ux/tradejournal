/**
 * Apre la (i) del fattore DISCIPLINA e fotografa il popover: il testo è
 * cambiato con la coda 3, e la lezione della prima onda è che una nota può
 * finire fuori dall'area visibile senza che nessun test se ne accorga.
 *
 *   node scripts/coda3-shot-info.mjs <accountId> <nome> [periodo]
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
  await client.send("Page.navigate", {
    url: period ? `${ORIGIN}/dashboard?period=${period}` : `${ORIGIN}/dashboard`,
  });
  await sleep(6000);
  const { result } = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const card = [...document.querySelectorAll("[data-slot='card'], .md-card")]
        .find((c) => /^\\s*SCORE/i.test(c.textContent || ""));
      if (!card) return null;
      card.scrollIntoView({ block: "center" });
      const btn = [...card.querySelectorAll("button")]
        .find((b) => /^Cos.{0,3} Disciplina/i.test(b.getAttribute("aria-label") || ""));
      if (!btn) return "nessun bottone Disciplina";
      const r = btn.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`,
    returnByValue: true,
  });
  if (!result.value || result.value[0] !== "{") {
    throw new Error(String(result.value));
  }
  const { x, y } = JSON.parse(result.value);
  // Radix apre su pointerdown vero: btn.click() da script non basta.
  for (const type of ["mousePressed", "mouseReleased"]) {
    await client.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }
  await sleep(1500);
  const shot = await client.send("Page.captureScreenshot", { format: "png" });
  await mkdir(OUT, { recursive: true });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  console.log(`scritto ${file}`);
} finally {
  await dispose();
}
