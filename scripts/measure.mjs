/**
 * MISURA nel DOM su build di produzione, con lo stesso Chrome headless degli
 * screenshot.
 *
 * Perché esiste: su `/analytics` la cattura headless non rende i grafici
 * (documentato nella Fase 20 — sei grafici e una simulazione da 5.000 path
 * nella stessa pagina), quindi la prova che i dati ci siano non può essere
 * una foto. Questo script apre la pagina come utente autenticato e valuta
 * un'espressione JavaScript nel contesto reale: conteggi di elementi, testi,
 * colori computati. Le stesse verifiche che prima si scrivevano a mano ogni
 * volta.
 *
 * Uso:
 *   node scripts/measure.mjs --url http://localhost:3100/analytics \
 *     --login demo@tradejournal.local:demo1234 [--account sim1-account]
 *     [--expr "document.querySelectorAll('svg').length"] [--file probe.js]
 *     [--wait 9000] [--theme dark] [--width 1280]
 *
 * L'espressione può essere una Promise: viene attesa. Il risultato è stampato
 * come JSON.
 */
import { readFile } from "node:fs/promises";
import { launchChrome, login, setAccount, setTheme, sleep } from "./cdp.mjs";

function parseArgs(argv) {
  const out = { width: 1280, height: 900, theme: "dark", wait: 9000 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--url") out.url = next();
    else if (arg === "--expr") out.expr = next();
    else if (arg === "--file") out.file = next();
    else if (arg === "--login") out.login = next();
    else if (arg === "--account") out.account = next();
    else if (arg === "--theme") out.theme = next();
    else if (arg === "--width") out.width = Number(next());
    else if (arg === "--height") out.height = Number(next());
    else if (arg === "--wait") out.wait = Number(next());
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url || (!args.expr && !args.file)) {
    console.error("Servono --url e uno fra --expr e --file");
    process.exit(1);
  }
  const expression = args.file
    ? await readFile(args.file, "utf8")
    : args.expr;

  const origin = new URL(args.url).origin;
  const { client, dispose } = await launchChrome(args);
  try {
    if (args.login) await login(client, origin, args.login);
    if (args.account) await setAccount(client, origin, args.account);
    await setTheme(client, origin, args.theme);

    await client.send("Page.navigate", { url: args.url });
    await sleep(args.wait);

    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
    }
    console.log(JSON.stringify(result.result?.value, null, 2));
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
