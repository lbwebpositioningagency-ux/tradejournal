import { describe, expect, it } from "vitest";

import { IMPLICAZIONI_MECCANICHE } from "./cot-contesto";

/**
 * Tabella delle implicazioni meccaniche del pannello COT.
 *
 * Il 26/08/2026 da questo file sono usciti i test del percorso "notizie"
 * insieme al percorso stesso; il 27/08 quelli dei due cancelli sul
 * linguaggio, insieme ai cancelli: dopo la rimozione del blocco discorsivo
 * della Sintesi non restava un solo testo da far passare di lì.
 */



describe("implicazioni meccaniche — tabella statica", () => {
  it("ogni combinazione metrica × banda esiste e non è un segnaposto", () => {
    /* L'asserzione «e passa il cancello lessicale» è caduta insieme al
       cancello. Tenerlo in vita per un test sarebbe stato codice di
       produzione mantenuto da un test invece che da un consumatore, ed è
       esattamente la definizione di codice morto con un alibi. */
    for (const metrica of ["mm_net", "open_interest"] as const) {
      for (const banda of ["MOLTO BASSO", "BASSO", "NELLA NORMA", "ALTO", "MOLTO ALTO"] as const) {
        const frase = IMPLICAZIONI_MECCANICHE[metrica][banda];
        expect(frase.length).toBeGreaterThan(20);
      }
    }
  });
});

