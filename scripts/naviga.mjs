/**
 * SONDA DI NAVIGAZIONE: apre una pagina, raccoglie tutto quello che il browser
 * dice, poi CLICCA un link e verifica che la pagina cambi davvero.
 *
 * Perché esiste. Uno screenshot non distingue «la pagina è ferma perché è
 * giusta così» da «la pagina è ferma perché React è morto durante
 * l'idratazione e i link non fanno più niente». Nel secondo caso il click non
 * produce nemmeno una richiesta di rete, quindi non lascia traccia neanche nei
 * log del server: l'unico posto dove il guasto si vede è la console del
 * browser, e questa sonda è il modo di leggerla.
 *
 * Uso:
 *   node scripts/naviga.mjs --url http://localhost:3100/macro-desk \
 *     --login demo@tradejournal.local:demo1234 --clicca "Sintesi" [--wait 8000]
 */
import { launchChrome, login, setTheme, sleep } from "./cdp.mjs";

function parseArgs(argv) {
  const out = { width: 1440, height: 900, theme: "dark", wait: 8000 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--url") out.url = next();
    else if (arg === "--login") out.login = next();
    else if (arg === "--clicca") (out.clicca ??= []).push(next());
    else if (arg === "--theme") out.theme = next();
    else if (arg === "--width") out.width = Number(next());
    else if (arg === "--wait") out.wait = Number(next());
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error("Serve --url");
    process.exit(1);
  }
  const origin = new URL(args.url).origin;
  const { client, dispose } = await launchChrome(args);
  const detriti = [];

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    client.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning") {
        detriti.push(
          `[console.${p.type}] ` +
            (p.args ?? [])
              .map((a) => a.value ?? a.description ?? a.type)
              .join(" ")
              .slice(0, 600),
        );
      }
    });
    client.on("Runtime.exceptionThrown", (p) => {
      const d = p.exceptionDetails ?? {};
      detriti.push(
        `[eccezione] ${d.text ?? ""} ${d.exception?.description ?? ""}`.slice(0, 900),
      );
    });
    client.on("Log.entryAdded", (p) => {
      if (p.entry?.level === "error") {
        detriti.push(`[log] ${p.entry.text} ${p.entry.url ?? ""}`.slice(0, 600));
      }
    });

    if (args.login) await login(client, origin, args.login);
    await setTheme(client, origin, args.theme);

    await client.send("Page.navigate", { url: args.url });
    await sleep(args.wait);

    const prima = await client.send("Runtime.evaluate", {
      expression: "location.pathname",
      returnByValue: true,
    });

    const percorso = [];
    for (const bersaglio of args.clicca ?? []) {
      /* Il click si dà con un evento vero sul nodo, non con `location.href`:
         è la navigazione lato client che si vuole mettere alla prova, e
         cambiare l'indirizzo a mano la salterebbe. */
      const esito = await client.send("Runtime.evaluate", {
        expression: `(() => {
          const testo = ${JSON.stringify(bersaglio)};
          /* Un bersaglio che comincia con «/» è un HREF esatto: il testo
             visibile non basta a distinguere «Report» del desk da «Reports»
             della barra laterale, e un falso positivo qui verrebbe letto come
             un guasto dell'applicazione. */
          const a = testo.startsWith('/')
            ? document.querySelector('a[href="' + testo + '"]')
            : [...document.querySelectorAll('a')]
                .find((x) => (x.innerText || '').trim().includes(testo));
          if (!a) return { trovato: false };
          a.click();
          return { trovato: true, href: a.getAttribute('href') };
        })()`,
        returnByValue: true,
      });
      const trovato = esito.result?.value ?? null;
      await sleep(4500);
      const p = await client.send("Runtime.evaluate", {
        expression: "location.pathname + ' | ' + (document.querySelector('h1')?.innerText ?? 'NESSUN H1')",
        returnByValue: true,
      });
      percorso.push({ cliccato: bersaglio, link: trovato, arrivo: p.result?.value ?? null });
    }

    console.log(
      JSON.stringify(
        { partenza: prima.result?.value ?? null, percorso, detriti },
        null,
        1,
      ),
    );
  } finally {
    await dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
