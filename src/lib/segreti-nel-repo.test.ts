import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// Modulo .mjs condiviso con l'hook di pre-commit: nessun tipo, si dichiara qui.
import * as segreti from "./segreti.mjs";

const {
  violazioniDiContenuto,
  violazioneDiPercorso,
  daIgnorare,
  LUNGHEZZA_MINIMA_SEGRETO,
} = segreti as {
  violazioniDiContenuto: (percorso: string, contenuto: string) => string[];
  violazioneDiPercorso: (percorso: string) => string | null;
  daIgnorare: (percorso: string) => boolean;
  LUNGHEZZA_MINIMA_SEGRETO: number;
};

/**
 * NESSUN SEGRETO SOTTO CONTROLLO DI VERSIONE.
 *
 * Il 26/08/2026 `eia_f.json` — la risposta grezza di una sonda alle rotte
 * EIA — è entrato in un commit con un `git add -A`. L'API dell'EIA rimanda
 * indietro i parametri della richiesta, quindi quel file conteneva
 * `EIA_API_KEY` in chiaro, e il repository è pubblico. La chiave è stata
 * revocata; questo test esiste perché non serva revocarne un'altra.
 *
 * Sta nel gate (`npm test`), non solo nell'hook di pre-commit: un hook si
 * salta con `--no-verify` e non esiste su una copia appena clonata prima del
 * primo `npm install`. Qui il controllo è sull'INTERO albero versionato, e
 * gira comunque prima di ogni pubblicazione.
 */

const RADICE = process.cwd();
/** Oltre questa soglia il file non si legge: sono lockfile e dati, non sonde. */
const BYTE_MASSIMI = 2 * 1024 * 1024;

/**
 * Estensioni BINARIE: il percorso si controlla lo stesso, il contenuto no.
 *
 * Decodificare un PNG come UTF-8 per passarci sopra delle regex è lavoro che
 * non può trovare niente — i pattern cercano `api_key=<valore>` in testo — e
 * costa: con le schermate di verifica del Macro Desk in archivio questo caso
 * ha superato i cinque secondi di timeout mentre macinava megabyte di pixel.
 *
 * Cosa NON si perde: le regole di PERCORSO valgono per ogni file versionato,
 * binari compresi, quindi una sonda o un dump con un nome sospetto viene preso
 * comunque. Resta scoperto solo un segreto nascosto DENTRO un binario, che
 * questo controllo non sapeva riconoscere neanche prima.
 */
const ESTENSIONI_BINARIE =
  /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)$/i;

function git(...argomenti: string[]): string {
  return execFileSync("git", argomenti, {
    encoding: "utf8",
    cwd: RADICE,
    maxBuffer: 256 * 1024 * 1024,
  });
}

function fileVersionati(): string[] {
  return git("ls-files")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Il contenuto si legge dall'INDICE di git, non dal disco.
 *
 * Non è pignoleria: leggendo la copia di lavoro questo test è fallito due
 * volte su tre esecuzioni consecutive mentre attorno giravano un merge, un
 * `rm -rf .next` e un build — cioè mentre qualcosa riscriveva file
 * versionati. Un controllo che ogni tanto grida al lupo per una gara con il
 * filesystem finisce ignorato quanto uno che tace, e questo esiste per essere
 * creduto. L'indice è anche la risposta giusta alla domanda che il test pone:
 * cosa c'è sotto controllo di versione, non cosa c'è per terra adesso.
 *
 * `git cat-file --batch` legge TUTTI i blob in un solo processo: il formato è
 * `<sha> <tipo> <byte>\n<contenuto>\n`, ripetuto.
 */
function contenutiDaIndice(percorsi: string[]): Map<string, string> {
  const righe = git("ls-files", "-s").split("\n").filter(Boolean);
  const shaPerPercorso = new Map<string, string>();
  for (const r of righe) {
    // "<modo> <sha> <stadio>\t<percorso>"
    const tab = r.indexOf("\t");
    if (tab < 0) continue;
    const sha = r.slice(0, tab).split(/\s+/)[1];
    const percorso = r.slice(tab + 1);
    if (sha) shaPerPercorso.set(percorso, sha);
  }

  const voluti = percorsi.filter(
    (p) => shaPerPercorso.has(p) && !ESTENSIONI_BINARIE.test(p),
  );
  if (voluti.length === 0) return new Map();

  const grezzo = execFileSync(
    "git",
    ["cat-file", "--batch"],
    {
      cwd: RADICE,
      input: voluti.map((p) => shaPerPercorso.get(p)!).join("\n") + "\n",
      maxBuffer: 512 * 1024 * 1024,
    },
  );

  const fuori = new Map<string, string>();
  let cursore = 0;
  for (const percorso of voluti) {
    const aCapo = grezzo.indexOf(0x0a, cursore);
    if (aCapo < 0) break;
    const intestazione = grezzo.toString("utf8", cursore, aCapo);
    const byte = Number(intestazione.split(" ")[2]);
    const inizio = aCapo + 1;
    if (!Number.isFinite(byte)) break;
    if (byte <= BYTE_MASSIMI) {
      fuori.set(percorso, grezzo.toString("utf8", inizio, inizio + byte));
    }
    cursore = inizio + byte + 1; // +1 per l'a-capo finale del blob
  }
  return fuori;
}

describe("i pattern riconoscono i segreti e lasciano stare il resto", () => {
  it("prende la forma esatta che ci è costata la chiave EIA", () => {
    const rispostaEia =
      '{"request":{"params":{"api_key":"erJErcE3WG8qpuQRhmUCq4z0hqYUREdf1QzyywUF",' +
      '"frequency":"weekly"}},"apiVersion":"2.1.13"}';
    const fuori = violazioniDiContenuto("sonda.json", rispostaEia);
    expect(fuori).toHaveLength(1);
    expect(fuori[0]).toContain("api_key");
    // Il messaggio NON contiene il valore: stamparlo lo copierebbe nei log.
    expect(fuori[0]).not.toContain("erJErcE3WG8");
  });

  it.each([
    ['{"api_key":"abcdefghijk1mnopqrstuvwxyz012345"}', "json"],
    ["https://api.esempio.org/v2?api_key=a1bcdefghijk2mnopqrs&x=1", "query"],
    ["CLIENT_SECRET=a1bcdefghijklmnopqrstuvwxyz", "env"],
    ['{"access_token": "ya29.abcdefghijklmnopqrstuvwxyz"}', "token"],
  ])("blocca %s (%s)", (testo) => {
    expect(violazioniDiContenuto("f.txt", testo).length).toBeGreaterThan(0);
  });

  /**
   * IL PUNTO CIECO, scritto invece che scoperto dopo. Il riconoscimento
   * chiede che il valore mescoli lettere e cifre, oppure che sia lungo
   * almeno 32 caratteri. Un segreto di sole lettere e più corto di così
   * passa. È una scelta: la versione permissiva segnalava nove file di
   * codice sano (`password: z.string().min(1, …)`), e un controllo che
   * grida al lupo viene disattivato — a quel punto non protegge da nulla.
   * Le chiavi vere dei fornitori usati qui (EIA, FRED, Yahoo) sono
   * alfanumeriche, quindi il buco è teorico; resta scritto perché chi
   * aggiunge un fornitore nuovo sappia che esiste.
   */
  it("punto cieco dichiarato: un segreto di sole lettere e corto passa", () => {
    const soloLettere = "abcdefghijklmnopqrstuvwx"; // 24 caratteri, zero cifre
    expect(violazioniDiContenuto("f.txt", `api_key=${soloLettere}`)).toEqual([]);
    // La stessa stringa, se lunga abbastanza, viene presa lo stesso.
    const lunga = soloLettere.repeat(2); // 48 caratteri
    expect(
      violazioniDiContenuto("f.txt", `api_key=${lunga}`).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    'API_KEY="<la-tua-chiave>"',
    "EIA_API_KEY=your-key-here",
    'api_key: "${EIA_API_KEY}"',
    "api_key=xxxxxxxxxxxxxxxxxxxx",
    "password=changeme",
  ])("non blocca il segnaposto: %s", (testo) => {
    expect(violazioniDiContenuto("f.txt", testo)).toEqual([]);
  });

  it("non blocca un valore troppo corto per essere una credenziale", () => {
    const corto = "a".repeat(LUNGHEZZA_MINIMA_SEGRETO - 1);
    expect(violazioniDiContenuto("f.txt", `api_key=${corto}`)).toEqual([]);
  });

  it("un .json alla radice è una violazione, dentro una cartella no", () => {
    expect(violazioneDiPercorso("eia_f.json")).toContain("radice");
    expect(violazioneDiPercorso("package.json")).toBeNull();
    expect(violazioneDiPercorso("dati/serie.json")).toBeNull();
  });
});

describe("l'albero versionato non contiene segreti né sonde", () => {
  it("nessun file sotto controllo di versione viola le regole", () => {
    const percorsi = fileVersionati();
    const contenuti = contenutiDaIndice(percorsi);
    const violazioni: string[] = [];
    for (const percorso of percorsi) {
      // Il percorso si controlla sempre; il contenuto solo se leggibile e
      // sotto la soglia (i lockfile non sono sonde).
      const perPercorso = violazioneDiPercorso(percorso);
      if (perPercorso && !daIgnorare(percorso)) violazioni.push(perPercorso);
      const contenuto = contenuti.get(percorso);
      if (contenuto === undefined || daIgnorare(percorso)) continue;
      violazioni.push(...violazioniDiContenuto(percorso, contenuto));
    }
    expect(violazioni).toEqual([]);
  });

  it("il file .env non è versionato", () => {
    expect(fileVersionati()).not.toContain(".env");
  });
});
