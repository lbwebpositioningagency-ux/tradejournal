import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ContestoVolatilitaPanel } from "./contesto-volatilita";
import type {
  ContestoVolatilita,
  RigaContestoVol,
} from "@/lib/queries/volatilita-contesto";

/**
 * La disciplina da terminale, verificata sul markup: ogni numero dichiara
 * unità, periodo, campione e FONTE, ogni dato dichiara la propria età, e il
 * rango sta accanto al livello — mai il livello nudo.
 *
 * E la proprietà che definisce questa sezione: qui dentro non entra nessuna
 * affermazione sul futuro.
 */

function riga(over: Partial<RigaContestoVol> = {}): RigaContestoVol {
  return {
    indice: "GVZ",
    etichetta: "Oro",
    decimaliIv: 2,
    disallineamento:
      "GVZ misura la volatilità implicita delle opzioni sull'ETF GLD; la realizzata è calcolata sullo spot.",
    iv: {
      livello: 23.4,
      giorno: "2026-08-21",
      etaGiorni: 4,
      rango: {
        percentile: 78.2,
        n: 4586,
        primoGiorno: "2008-06-03",
        ultimoGiorno: "2026-08-21",
        minimo: 10.1,
        massimo: 64.5,
      },
      variazioni: [
        { sedute: 5, assoluta: 1.2, relativa: 0.054, giornoBase: "2026-08-14" },
        { sedute: 20, assoluta: 2.5, relativa: 0.12, giornoBase: "2026-07-24" },
        { sedute: 60, assoluta: -1.1, relativa: -0.045, giornoBase: "2026-05-29" },
      ],
      fonte: "CBOE Global Markets via FRED",
      notaFonte: "Volatilità implicita dell'ETF sull'oro, chiusure CBOE dal 2008.",
    },
    motivoIvAssente: null,
    prezzo: {
      livello: 4076.4,
      giorno: "2026-08-24",
      etaGiorni: 1,
      rango: null,
      variazioni: [],
      fonte: "Dukascopy Bank SA",
      notaFonte: "Spot oro/dollaro.",
    },
    realizzata: [{ sedute: 20, annualizzata: 0.183, n: 20 }],
    movimento: [
      { sedute: 20, mediana: 0.0072, q25: 0.0034, q75: 0.0118, massimo: 0.0241, n: 20 },
      { sedute: 60, mediana: 0.0081, q25: 0.0039, q75: 0.0131, massimo: 0.0402, n: 60 },
    ],
    escursione: [
      { sedute: 20, mediana: 0.0143, q25: 0.0091, q75: 0.0212, massimo: 0.0388, n: 20, senzaOhlc: 0 },
      { sedute: 60, mediana: 0.0151, q25: 0.0096, q75: 0.0224, massimo: 0.0501, n: 54, senzaOhlc: 6 },
    ],
    escursioneUltima: {
      giorno: "2026-08-24",
      relativa: 0.0166,
      assoluta: 67.7,
      rango: {
        percentile: 62.4,
        n: 6412,
        primoGiorno: "1999-06-03",
        ultimoGiorno: "2026-08-24",
        minimo: 0.0009,
        massimo: 0.0912,
      },
    },
    coperturaOhlc: { conOhlc: 6412, totali: 7945 },
    ultimaChiusura: 4076.4,
    ...over,
  };
}

const contesto = (righe: RigaContestoVol[]): ContestoVolatilita => ({
  righe,
  oggi: "2026-08-25",
});

function resa(righe: RigaContestoVol[]) {
  return renderToStaticMarkup(
    <ContestoVolatilitaPanel contesto={contesto(righe)} />,
  );
}

describe("ContestoVolatilita — il livello non è mai nudo", () => {
  const html = resa([riga()]);

  it("il rango accompagna il livello, con il periodo e la numerosità", () => {
    expect(html).toContain("23,40");
    expect(html).toContain("più alto del");
    expect(html).toContain("78%");
    expect(html).toContain("delle sedute dal 2008");
    // it-IT non raggruppa le migliaia a quattro cifre (regola "min2" del locale)
    expect(html).toContain("n=4586");
  });

  it("dichiara gli estremi storici: danno la scala del percentile", () => {
    expect(html).toContain("minimo 10,10");
    expect(html).toContain("massimo 64,50");
  });

  it("le tre variazioni portano ciascuna la propria data di partenza", () => {
    for (const s of ["5 sedute", "20 sedute", "60 sedute"]) expect(html).toContain(s);
    expect(html).toContain("dal 14/08/2026");
    expect(html).toContain("dal 24/07/2026");
  });

  it("il segno della variazione è esplicito, in punti e in percentuale", () => {
    expect(html).toContain("+1,20");
    expect(html).toContain("-1,10");
  });
});

describe("ContestoVolatilita — provenienza ed età", () => {
  const html = resa([riga()]);

  it("ogni serie dichiara la propria fonte, non solo chi la ridistribuisce", () => {
    expect(html).toContain("CBOE Global Markets via FRED");
    expect(html).toContain("Dukascopy Bank SA");
  });

  it("ogni dato dichiara la data dell'osservazione e la propria età", () => {
    expect(html).toContain("al 21/08/2026");
    expect(html).toContain("4 giorni fa");
  });

  it("dichiara rispetto a quale giorno le età sono calcolate", () => {
    expect(html).toContain("25/08/2026");
    expect(html).toContain("fuso dell");
  });
});

describe("ContestoVolatilita — implicita contro realizzata", () => {
  const html = resa([riga()]);

  it("mostra i due numeri e il loro scarto, con la finestra e il campione", () => {
    expect(html).toContain("implicita 23,4%");
    expect(html).toContain("realizzata 18,3%");
    expect(html).toContain("scarto");
    expect(html).toContain("pp");
    expect(html).toContain("ultime 20 sedute (n=20)");
  });

  it("dichiara come la realizzata è calcolata: nessuna formula implicita", () => {
    expect(html).toContain("deviazione standard dei rendimenti log");
    expect(html).toContain("annualizzata ×√252");
  });

  it("dichiara il disallineamento fra sottostante dell'indice e dello spot", () => {
    expect(html).toContain("ETF GLD");
  });

  it("senza realizzata il confronto non compare affatto, invece di un placeholder", () => {
    const html2 = resa([riga({ realizzata: [] })]);
    expect(html2).not.toContain("Implicita contro realizzata");
  });
});

describe("ContestoVolatilita — movimento osservato", () => {
  const html = resa([riga()]);

  it("mediana, banda 25-75%, massimo e campione, per ogni finestra", () => {
    expect(html).toContain("Movimento giornaliero osservato");
    expect(html).toContain("banda 25-75%");
    expect(html).toContain("massimo");
    expect(html).toContain("n=60");
  });

  it("dichiara che è chiusura-chiusura e che STA SOTTO l'escursione vera", () => {
    expect(html).toContain("Variazione fra due chiusure");
    expect(html).toContain("SOTTO");
    // la differenza fra le due misure è scritta, non lasciata dedurre
    expect(html).toContain("torna in pari vale zero qui");
  });

  it("la cifra in valuta dichiara su quale chiusura è calcolata", () => {
    expect(html).toContain("ultima chiusura 4076,40 del 24/08/2026");
  });
});

describe("ContestoVolatilita — niente verdetti", () => {
  it("nessuna parola di previsione o di probabilità nel markup", () => {
    const html = resa([riga()]);
    /* L'unica occorrenza ammessa di "previsioni" è la NEGAZIONE in apertura
       ("sono misure, non previsioni"): si toglie prima di cercare, così il
       test resta severo su tutto il resto invece di essere disattivato. */
    const testo = html.toLowerCase().replace("non previsioni", "");
    for (const vietata of [
      "probabil",
      "hit rate",
      "prevision",
      "prevede",
      "espansa",
      "compressa",
      "dei casi",
      "rialzist",
      "ribassist",
    ]) {
      expect(testo).not.toContain(vietata);
    }
  });

  it("dichiara in apertura di essere misure e non previsioni", () => {
    expect(resa([riga()])).toContain("Sono misure, non previsioni");
  });
});

describe("ContestoVolatilita — assenze dichiarate", () => {
  it("un indice senza fonte viva porta il proprio motivo, non un vuoto", () => {
    const html = resa([
      riga({
        indice: "VDAX",
        etichetta: "GER40 (DAX)",
        iv: null,
        motivoIvAssente: "Nessuna fonte gratuita disponibile: il ticker è fermo al 2016.",
      }),
    ]);
    expect(html).toContain("dato non disponibile");
    expect(html).toContain("fermo al 2016");
  });

  it("contesto vuoto degrada a un messaggio, non a una pagina bianca", () => {
    expect(resa([])).toContain("Contesto di volatilità non disponibile");
  });
});

describe("ContestoVolatilita — escursione vera accanto alla chiusura-chiusura", () => {
  const html = resa([riga()]);

  it("le DUE misure convivono e sono distinguibili a schermo", () => {
    // sostituirne una con l'altra sarebbe perdere informazione: rispondono a
    // due domande diverse sulla stessa giornata
    expect(html).toContain("Escursione vera della giornata");
    expect(html).toContain("Movimento giornaliero osservato");
    expect(html.indexOf("Escursione vera")).toBeLessThan(
      html.indexOf("Movimento giornaliero"),
    );
  });

  it("l'ultima seduta porta livello, ampiezza in prezzo, data e rango", () => {
    expect(html).toContain("1,66%");
    expect(html).toContain("67,70 di ampiezza il 24/08/2026");
    expect(html).toContain("più ampia del");
    expect(html).toContain("62%");
    expect(html).toContain("delle sedute dal 1999");
    expect(html).toContain("n=6412");
  });

  it("l'escursione mediana è più ampia del movimento sulla stessa finestra", () => {
    // proprietà del dato, non del testo: |close-close| <= high-low per costruzione
    expect(html).toContain("1,43%"); // escursione mediana a 20 sedute
    expect(html).toContain("0,72%"); // movimento mediano a 20 sedute
  });

  it("una seduta ancora aperta è dichiarata tale, non spacciata per chiusa", () => {
    // la sua escursione può solo crescere: mostrarla come «l'escursione di
    // ieri» sarebbe un numero destinato a smentirsi entro sera
    const viva = resa([
      riga({
        escursioneUltima: {
          giorno: "2026-08-25", // = `oggi` del contesto di prova
          relativa: 0.0051,
          assoluta: 133.43,
          rango: {
            percentile: 19,
            n: 9775,
            primoGiorno: "1987-12-30",
            ultimoGiorno: "2026-08-25",
            minimo: 0.0006,
            massimo: 0.14,
          },
        },
      }),
    ]);
    expect(viva).toContain("seduta ancora aperta");
    expect(viva).toContain("non è ancora chiusa");
    // e il caso normale non porta il rumore
    expect(html).not.toContain("seduta ancora aperta");
  });

  it("dichiara come è definita e da dove viene, senza formule implicite", () => {
    expect(html).toContain("Massimo meno minimo della seduta, diviso la chiusura");
    expect(html).toContain("quello che uno stop incontra");
    expect(html).toContain("Dukascopy Bank SA");
  });
});

describe("ContestoVolatilita — il campione dell'escursione non si mescola mai", () => {
  it("dichiara quante sedute dell'archivio hanno massimo e minimo, su quante", () => {
    const html = resa([riga()]);
    expect(html).toContain("6412");
    expect(html).toContain("7945");
    expect(html).toContain("che hanno massimo e minimo");
  });

  it("una finestra parziale dichiara le sedute escluse invece di tacerle", () => {
    const html = resa([riga()]);
    // la finestra a 60 del fixture ha 54 sedute utili su 60
    expect(html).toContain("n=54 su 60 (6 sedute senza massimo e minimo, escluse)");
  });

  it("una finestra piena non aggiunge rumore", () => {
    const html = resa([riga()]);
    expect(html).toContain("massimo 3,88% · n=20<");
  });

  it("senza high/low il blocco dichiara perché, e non ricostruisce niente", () => {
    const html = resa([
      riga({
        etichetta: "Petrolio WTI",
        escursione: [],
        escursioneUltima: null,
        coperturaOhlc: { conOhlc: 0, totali: 10225 },
        prezzo: {
          livello: 86.48,
          giorno: "2026-08-18",
          etaGiorni: 7,
          rango: null,
          variazioni: [],
          fonte: "U.S. Energy Information Administration via FRED",
          notaFonte: "Prezzo spot Cushing.",
        },
      }),
    ]);
    expect(html).toContain("Escursione vera della giornata");
    expect(html).toContain("dato non disponibile");
    // dichiara il FATTO osservabile, non una causa che non può conoscere:
    // «nessuna fonte le pubblica» e «archivio non ancora riscritto» danno lo
    // stesso schermo, e affermare la prima sarebbe falso nella seconda
    expect(html).toContain("Nessuna delle");
    expect(html).toContain("10.225"); // it-IT raggruppa da cinque cifre in su
    expect(html).toContain("porta massimo e minimo");
    expect(html).toContain("non si ricostruisce dalla");
    expect(html).not.toContain("pubblica solo la chiusura");
    // e soprattutto: nessun numero inventato al posto del dato mancante
    expect(html).not.toContain("più ampia del");
  });
});
