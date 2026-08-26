/**
 * Riconoscimento di segreti e di file di sonda finiti sotto controllo di
 * versione. Modulo PURO: nessun I/O, nessun git — così la stessa logica serve
 * sia al hook di pre-commit (`scripts/pre-commit.mjs`) sia al test che gira
 * nel gate (`src/lib/segreti-nel-repo.test.ts`), senza poter divergere.
 *
 * Sta in `src/lib/` e non in `scripts/`, dove sarebbe stato più naturale,
 * per una ragione precisa: `.vercelignore` esclude `scripts` dall'upload,
 * mentre `tsconfig.json` include ogni file .ts del progetto — quindi un test
 * in `src/` che importa da `scripts/` compila in locale e non trova il modulo
 * sul build di Vercel. Il primo tentativo è finito esattamente così.
 *
 * Perché esiste. Il 26/08/2026 `eia_f.json` è entrato in un commit con un
 * `git add -A`: era la risposta grezza di una sonda alle rotte EIA, e l'API
 * dell'EIA rimanda indietro i parametri della richiesta, `api_key` compresa.
 * Il commit è finito su un repository PUBBLICO. Il .gitignore da solo non
 * basta — copre i nomi che si prevedono, non quelli che non si prevedono —
 * quindi qui si guarda il CONTENUTO.
 *
 * Criterio dei pattern: si cerca un nome di parametro/variabile che significa
 * "segreto" seguito da un valore lungo e non-segnaposto. Non si cerca
 * l'entropia in astratto: produrrebbe falsi positivi su hash, id e lockfile,
 * e un controllo che grida al lupo viene disattivato.
 */

/** Valori che NON sono segreti: esempi, segnaposto, variabili non risolte. */
const SEGNAPOSTO =
  /^(x{3,}|\.{3,}|<[^>]*>|\$\{[^}]*\}|your[-_ ]?\w*|changeme|placeholder|null|undefined|true|false|\d+)$/i;

/**
 * Valori dichiaratamente finti. Prefisso, non uguaglianza: le fixture dei
 * test si chiamano `test-secret-abc123`, e sono credenziali per forma ma non
 * per sostanza. Chi scrive una chiave vera non la fa cominciare per «test-».
 */
const PREFISSI_FINTI = /^(test|fake|dummy|example|sample|mock|finto)[-_.]/i;

/** Lunghezza minima perché una stringa valga come credenziale. */
export const LUNGHEZZA_MINIMA_SEGRETO = 16;

/**
 * Nomi che introducono un segreto, come chiave JSON, parametro di query o
 * variabile d'ambiente. `api_key` è il primo perché è quello che ci è
 * costato la chiave EIA.
 */
const NOMI_SEGRETO = [
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "auth_token",
  "secret",
  "client_secret",
  "password",
  "passwd",
  "private_key",
  "bearer",
];

/* `nome` seguito da `:` o `=` e da un valore fatto SOLO di caratteri da
   credenziale (lettere, cifre, `-`, `_`, `.`): copre JSON (`"api_key":"…"`),
   query string (`api_key=…`) e formato env (`API_KEY=…`).

   Perché il set di caratteri è così stretto. La prima versione prendeva
   «tutto fino al separatore» e segnalava nove file di codice sano —
   `password: z.string().min(1, …)`, `api_key=${encodeURIComponent(chiave)}`,
   `hasPassword={user.passwordHash !== null}`. Un controllo che grida al lupo
   viene disattivato dopo la seconda volta, e allora tanto vale non averlo.
   Parentesi, graffe, `$` e spazi sono sintassi: dove ci sono, non c'è una
   credenziale scritta in chiaro. */
const RE_SEGRETO = new RegExp(
  `["'\`]?(${NOMI_SEGRETO.join("|")})["'\`]?\\s*[:=]\\s*["'\`]?([A-Za-z0-9_.\\-]{${LUNGHEZZA_MINIMA_SEGRETO},})`,
  "gi",
);

/**
 * Il valore ha la FORMA di una credenziale? Serve a separare
 * `erJErcE3WG8qpuQRhmUCq4z0hqYUREdf1QzyywUF` da `Password-obbligatoria`.
 * Due strade, perché le chiavi vere prendono entrambe: mescola lettere e
 * cifre, oppure è semplicemente lunga (32+ caratteri di fila senza spazi non
 * capitano per caso in una stringa di interfaccia).
 */
const LUNGHEZZA_SOSPETTA_DA_SOLA = 32;

function sembraCredenziale(valore) {
  if (valore.length >= LUNGHEZZA_SOSPETTA_DA_SOLA) return true;
  return /[A-Za-z]/.test(valore) && /\d/.test(valore);
}

/** File alla radice che possono essere .json: tutto il resto è una sonda. */
export const JSON_AMMESSI_ALLA_RADICE = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "components.json",
  "vercel.json",
]);

/**
 * File che possono contenere un nome di segreto senza esserlo: il codice che
 * LEGGE la chiave, la documentazione che ne parla, e questo stesso modulo coi
 * suoi pattern. L'elenco è volutamente corto e per percorso esatto: un
 * carveout largo (per estensione, per cartella) svuoterebbe il controllo.
 */
export const PERCORSI_ESENTI = new Set([
  ".env.example",
  ".gitignore",
  "src/lib/segreti.mjs",
  "scripts/pre-commit.mjs",
  "src/lib/segreti-nel-repo.test.ts",
]);

/** Estensioni che non si leggono come testo (e non conterrebbero segreti). */
const BINARI = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz)$/i;

export function daIgnorare(percorso) {
  return PERCORSI_ESENTI.has(percorso) || BINARI.test(percorso);
}

/**
 * Il percorso da solo è già una violazione? Oggi: un .json alla radice che
 * non sia uno dei file di configurazione noti. È la regola che avrebbe
 * fermato `eia_f.json` e `y_cl.json` prima ancora di guardarne il contenuto.
 */
export function violazioneDiPercorso(percorso) {
  const alLivelloAlto = !percorso.includes("/");
  if (!alLivelloAlto || !percorso.endsWith(".json")) return null;
  if (JSON_AMMESSI_ALLA_RADICE.has(percorso)) return null;
  return (
    `${percorso}: file .json alla radice del progetto. Le risposte grezze ` +
    `delle sonde non vanno versionate — spostalo nella cartella di lavoro ` +
    `temporanea, oppure aggiungilo a JSON_AMMESSI_ALLA_RADICE se è davvero ` +
    `configurazione.`
  );
}

/**
 * Segreti nel contenuto. Restituisce una riga per violazione, col NOME del
 * parametro e la posizione — mai il valore: un controllo che stampa la
 * credenziale la copia nei log di CI, cioè rifà il danno che deve impedire.
 */
export function violazioniDiContenuto(percorso, contenuto) {
  const fuori = [];
  RE_SEGRETO.lastIndex = 0;
  let m;
  while ((m = RE_SEGRETO.exec(contenuto)) !== null) {
    const [, nome, valore] = m;
    if (SEGNAPOSTO.test(valore)) continue;
    if (PREFISSI_FINTI.test(valore)) continue;
    if (!sembraCredenziale(valore)) continue;
    const riga = contenuto.slice(0, m.index).split("\n").length;
    fuori.push(
      `${percorso}:${riga}: «${nome}» con un valore di ${valore.length} ` +
        `caratteri. Se è una credenziale vera va tolta dal file E revocata: ` +
        `una volta in un commit è da considerare compromessa.`,
    );
  }
  return fuori;
}

/** Tutte le violazioni di un file (percorso + contenuto). */
export function violazioniIn(percorso, contenuto) {
  if (daIgnorare(percorso)) return [];
  const fuori = [];
  const perPercorso = violazioneDiPercorso(percorso);
  if (perPercorso) fuori.push(perPercorso);
  fuori.push(...violazioniDiContenuto(percorso, contenuto));
  return fuori;
}
