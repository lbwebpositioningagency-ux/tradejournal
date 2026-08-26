import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Modulo .mjs condiviso con l'hook di pre-commit: nessun tipo, si dichiara qui.
import * as segreti from "./segreti.mjs";

const {
  violazioniIn,
  violazioniDiContenuto,
  violazioneDiPercorso,
  LUNGHEZZA_MINIMA_SEGRETO,
} = segreti as {
  violazioniIn: (percorso: string, contenuto: string) => string[];
  violazioniDiContenuto: (percorso: string, contenuto: string) => string[];
  violazioneDiPercorso: (percorso: string) => string | null;
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

function fileVersionati(): string[] {
  return execFileSync("git", ["ls-files"], {
    encoding: "utf8",
    cwd: RADICE,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
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
    const violazioni: string[] = [];
    for (const percorso of fileVersionati()) {
      const assoluto = join(RADICE, percorso);
      let dimensione = 0;
      try {
        dimensione = statSync(assoluto).size;
      } catch {
        continue; // versionato ma assente dal disco (checkout parziale)
      }
      if (dimensione > BYTE_MASSIMI) continue;
      let contenuto: string;
      try {
        contenuto = readFileSync(assoluto, "utf8");
      } catch {
        continue;
      }
      violazioni.push(...violazioniIn(percorso, contenuto));
    }
    expect(violazioni).toEqual([]);
  });

  it("il file .env non è versionato", () => {
    expect(fileVersionati()).not.toContain(".env");
  });
});
