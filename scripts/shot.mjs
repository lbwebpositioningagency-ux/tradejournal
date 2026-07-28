/**
 * Screenshot su build di PRODUZIONE via Chrome headless + CDP.
 *
 * Perché non il pannello browser integrato: in questo ambiente non compone
 * i frame (screenshot in timeout), quindi le verifiche visive si fanno con
 * Chrome headless — nessuna dipendenza npm aggiunta, solo il browser di
 * sistema e il protocollo DevTools.
 *
 * Uso:
 *   node scripts/shot.mjs --out docs/xxx --url http://localhost:3100/dashboard \
 *        --name dashboard [--width 1280] [--height 900] [--theme dark]
 *        [--account <id>] [--login email:password] [--full]
 *
 * Più URL: ripetere --url/--name in coppia nello stesso ordine.
 *
 * LIMITE NOTO (non è un difetto dell'app): alcune card con Recharts escono
 * in foto coi soli assi. I ResponsiveContainer misurano la card una volta e
 * fuori da un browser che compone i frame leggono la larghezza PRIMA che la
 * griglia a due colonne si risolva, così le serie vengono disegnate oltre il
 * bordo della card. Nel DOM i dati ci sono (verificato: 199 barre nella
 * Sequenza trade, aree in Underwater e Monte Carlo) e in un browser vero il
 * ResizeObserver corregge subito. Lo stesso artefatto è presente negli
 * screenshot delle fasi precedenti. Tentativi già fatti e SCARTATI perché
 * peggiorano: resize del viewport all'altezza del documento, nudge di 1px,
 * evento resize forzato, passata di scroll, finestra headful.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

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
  }
  return out;
}

async function cdp(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return res.json();
}

/** Client CDP minimale su WebSocket (Node 22 ha WebSocket globale). */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(e));
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return {
    ready,
    send(method, params = {}) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv);
  if (!args.out || args.urls.length === 0) {
    console.error("Servono --out e almeno un --url");
    process.exit(1);
  }
  await mkdir(args.out, { recursive: true });

  const port = 9222 + Math.floor(Math.random() * 300);
  const profile = join(tmpdir(), `tj-shot-${port}`);
  const chrome = spawn(
    CHROME,
    [
      // SHOT_HEADFUL=1 apre una finestra vera (utile solo per indagare).
      ...(process.env.SHOT_HEADFUL === "1" ? [] : ["--headless=new"]),
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${args.width},${args.height}`,
    ],
    { stdio: "ignore" },
  );

  let target;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await cdp(port, "/json/list");
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {
      /* Chrome non ancora pronto */
    }
    await sleep(250);
  }
  if (!target) throw new Error("Chrome headless non risponde");

  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: args.width,
    height: args.height,
    deviceScaleFactor: 1,
    mobile: args.width < 500,
  });

  const origin = new URL(args.urls[0]).origin;

  // Login via l'endpoint reale (credentials): niente sessioni finte.
  if (args.login) {
    const [email, password] = args.login.split(":");
    await client.send("Page.navigate", { url: `${origin}/login` });
    await sleep(2500);
    const script = `(async () => {
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      const body = new URLSearchParams({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)}, csrfToken, callbackUrl: '/dashboard', json: 'true' });
      const res = await fetch('/api/auth/callback/credentials', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      return res.status;
    })()`;
    const result = await client.send("Runtime.evaluate", {
      expression: script,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error("Login fallito: " + JSON.stringify(result.exceptionDetails));
    }
  }

  // Conto attivo via cookie, come farebbe lo switcher.
  if (args.account) {
    await client.send("Network.setCookie", {
      name: "tj-account",
      value: args.account,
      url: origin,
      path: "/",
    });
  }

  // Tema: il progetto usa next-themes (localStorage "theme") + classe .dark.
  await client.send("Page.navigate", { url: origin });
  await sleep(1200);
  await client.send("Runtime.evaluate", {
    expression: `localStorage.setItem('theme', ${JSON.stringify(args.theme)})`,
  });

  for (let i = 0; i < args.urls.length; i++) {
    const url = args.urls[i];
    const name = args.names[i] ?? `shot-${i + 1}`;
    await client.send("Page.navigate", { url });
    await sleep(args.wait ?? 3500);


    // Pagina intera SENZA cambiare il viewport: `captureBeyondViewport`
    // fotografa oltre la finestra lasciando intatto il layout misurato.
    // (Allargare il viewport all'altezza del documento, come si farebbe
    // d'istinto, fa ri-misurare i ResponsiveContainer di Recharts in uno
    // stato transitorio: le serie finiscono disegnate fuori dalle card e le
    // schede sembrano vuote in foto.)
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

    const shot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      ...(clip ? { clip } : {}),
    });
    const file = join(args.out, `${name}__${args.width}__${args.theme}.png`);
    await writeFile(file, Buffer.from(shot.data, "base64"));
    console.log("scritto", file);
  }

  client.close();
  chrome.kill();
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
