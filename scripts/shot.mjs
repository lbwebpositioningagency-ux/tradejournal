/**
 * Screenshot su build di PRODUZIONE via Chrome headless + CDP.
 *
 * Avvio del browser, login, conto attivo e tema stanno in `scripts/cdp.mjs`,
 * condivisi con `scripts/measure.mjs` (misure nel DOM). Lì è spiegato anche
 * perché si emula `prefers-reduced-motion`: senza, i grafici Recharts si
 * fotografano vuoti.
 *
 * Uso:
 *   node scripts/shot.mjs --out docs/xxx --url http://localhost:3100/dashboard \
 *        --name dashboard [--width 1280] [--height 900] [--theme dark]
 *        [--account <id>] [--login email:password] [--full] [--wait 7000]
 *
 * Più URL: ripetere --url/--name in coppia nello stesso ordine.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { launchChrome, login, setAccount, setTheme, sleep } from "./cdp.mjs";

function parseArgs(argv) {
  const out = { urls: [], names: [], width: 1280, height: 900, theme: "dark" };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--url") out.urls.push(next());
    else if (arg === "--name") out.names.push(next());
    else if (arg === "--out") out.out = next();
    else if (arg === "--width") out.width = Number(next());
    else if (arg === "--height") out.height = Number(next());
    else if (arg === "--theme") out.theme = next();
    else if (arg === "--account") out.account = next();
    else if (arg === "--login") out.login = next();
    else if (arg === "--full") out.full = true;
    else if (arg === "--wait") out.wait = Number(next());
    else if (arg === "--scroll-to") out.scrollTo = next();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.out || args.urls.length === 0) {
    console.error("Servono --out e almeno un --url");
    process.exit(1);
  }
  await mkdir(args.out, { recursive: true });

  const origin = new URL(args.urls[0]).origin;
  const { client, dispose } = await launchChrome(args);

  try {
    if (args.login) await login(client, origin, args.login);
    if (args.account) await setAccount(client, origin, args.account);
    await setTheme(client, origin, args.theme);

    for (let i = 0; i < args.urls.length; i++) {
      const url = args.urls[i];
      const name = args.names[i] ?? `shot-${i + 1}`;
      await client.send("Page.navigate", { url });
      await sleep(args.wait ?? 7000);

      // Pagina intera SENZA cambiare il viewport: `captureBeyondViewport`
      // fotografa oltre la finestra lasciando intatto il layout misurato.
      // (Allargare il viewport all'altezza del documento, come si farebbe
      // d'istinto, fa ri-misurare i ResponsiveContainer di Recharts in uno
      // stato transitorio: le serie finiscono disegnate fuori dalle card e le
      // schede sembrano vuote in foto.)
      // Inquadratura su una sezione: si scorre la card che contiene il testo
      // e si fotografa il solo viewport. È l'unico modo di avere i grafici
      // Recharts DISEGNATI (vedi sotto).
      if (args.scrollTo) {
        await client.send("Runtime.evaluate", {
          expression: `(() => {
            const card = [...document.querySelectorAll("[data-slot='card']")]
              .find((c) => c.textContent.includes(${JSON.stringify(args.scrollTo)}));
            if (!card) return false;
            card.scrollIntoView({ block: 'start' });
            window.scrollBy(0, -16);
            return true;
          })()`,
          returnByValue: true,
        });
        await sleep(1200);
      }

      let clip;
      if (args.full) {
        const metrics = await client.send("Page.getLayoutMetrics");
        clip = {
          x: 0,
          y: 0,
          width: args.width,
          height: Math.ceil(metrics.cssContentSize.height),
          scale: 1,
        };
      }

      // `captureBeyondViewport` fotografa oltre la finestra, ma per farlo
      // Chrome RI-MISURA il layout a tutta l'altezza del documento: i
      // ResponsiveContainer di Recharts si ridimensionano durante lo scatto e
      // le serie finiscono disegnate fuori dalla card — è la causa vera delle
      // "card vuote" viste dalla Fase 14 in poi su pagine con molti grafici.
      // Senza (`--scroll-to`), si fotografa il solo viewport, che è misurato e
      // stabile: i grafici ci sono.
      const beyond = !args.scrollTo;
      const shot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: beyond,
        ...(clip ? { clip } : {}),
      });
      const file = join(args.out, `${name}__${args.width}__${args.theme}.png`);
      await writeFile(file, Buffer.from(shot.data, "base64"));
      console.log("scritto", file);
    }
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
