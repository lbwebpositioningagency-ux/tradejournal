/**
 * Chrome headless via CDP: la parte condivisa fra `shot.mjs` (screenshot) e
 * `measure.mjs` (misure nel DOM).
 *
 * Perché non il pannello browser integrato: in questo ambiente non compone i
 * frame, quindi le verifiche visive si fanno con Chrome headless — nessuna
 * dipendenza npm aggiunta, solo il browser di sistema e il protocollo
 * DevTools.
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  /* Gli EVENTI, non solo le risposte. Servono a leggere quello che il browser
     dice di sua iniziativa — errori di console, eccezioni non catturate — che
     è l'unico modo di vedere un guasto che avviene durante l'idratazione,
     cioè prima che si possa iniettare qualunque sonda nella pagina. */
  const ascoltatori = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const cb of ascoltatori.get(msg.method) ?? []) cb(msg.params);
    }
  });
  return {
    ready,
    on(metodo, cb) {
      const attuali = ascoltatori.get(metodo) ?? [];
      attuali.push(cb);
      ascoltatori.set(metodo, attuali);
    },
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

/**
 * Avvia Chrome headless e restituisce un client CDP pronto.
 *
 * `prefers-reduced-motion: reduce` è emulato SEMPRE: le animazioni d'ingresso
 * di Recharts girano su requestAnimationFrame, che senza frame composti non
 * scatta mai — barre e punti resterebbero a scala zero, le foto uscirebbero
 * vuote e le misure nel DOM leggerebbero geometrie a zero. I componenti
 * rispettano la media query (src/components/charts/use-chart-animation.ts).
 */
export async function launchChrome({ width = 1280, height = 900 } = {}) {
  const port = 9222 + Math.floor(Math.random() * 300);
  const profile = join(tmpdir(), `tj-cdp-${port}`);
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
      `--window-size=${width},${height}`,
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
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  return {
    client,
    async dispose() {
      client.close();
      chrome.kill();
      await sleep(500);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/**
 * Login via l'endpoint reale (credentials): niente sessioni finte.
 *
 * Il rate limiting del login (10 tentativi/15 min per email, FASE 9) vale
 * anche per queste sessioni: senza il controllo sullo status si finisce per
 * fotografare — o misurare — la pagina di login credendo di essere dentro
 * l'app.
 */
export async function login(client, origin, credentials) {
  const [email, password] = credentials.split(":");
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
  const status = result.result?.value;
  if (status !== 200) {
    throw new Error(
      `Login rifiutato (HTTP ${status}). Se hai appena fatto molti screenshot, ` +
        "è il rate limiting: attendi qualche minuto.",
    );
  }
}

/** Conto attivo via cookie, come farebbe lo switcher. */
export async function setAccount(client, origin, accountId) {
  await client.send("Network.setCookie", {
    name: "tj-account",
    value: accountId,
    url: origin,
    path: "/",
  });
}

/** Tema: il progetto usa next-themes (localStorage "theme") + classe .dark. */
export async function setTheme(client, origin, theme) {
  await client.send("Page.navigate", { url: origin });
  await sleep(1200);
  await client.send("Runtime.evaluate", {
    expression: `localStorage.setItem('theme', ${JSON.stringify(theme)})`,
  });
}
