import { describe, expect, it } from "vitest";
import {
  differenzeFraVersioni,
  revisioneDaDire,
  type VersioneArchiviata,
} from "@/lib/macro-desk-versioni";

/**
 * La riga «è stato rifatto» è PARCA per scelta: compare solo quando la
 * revisione ha cambiato un bias. Questi test sorvegliano
 * soprattutto i casi in cui NON deve comparire — è lì che una riga di troppo
 * si trasforma in arredamento, e l'arredamento insegna a saltare la zona in
 * cui vive.
 */

const ARRIVO_1 = new Date("2026-08-28T09:43:28Z");
const ARRIVO_2 = new Date("2026-08-28T14:59:24Z");

function versione(
  assets: { id: string; name?: string; bias?: string; conf?: number }[],
  arrivatoIl = ARRIVO_2,
): VersioneArchiviata {
  return {
    arrivatoIl,
    payload: {
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        weekly: { biasLabel: a.bias, confidence: a.conf },
      })),
    },
  };
}

describe("differenzeFraVersioni", () => {
  it("bias cambiato: lo dice con i due valori, non con un «modificato»", () => {
    expect(
      differenzeFraVersioni(
        versione([{ id: "oil", name: "Petrolio", bias: "NEUTRALE", conf: 45 }]).payload,
        versione([{ id: "oil", name: "Petrolio", bias: "RIBASSISTA", conf: 45 }]).payload,
      ),
    ).toEqual(["il bias di Petrolio è passato da NEUTRALE a RIBASSISTA"]);
  });

  it("solo la confidenza cambiata: nessuna riga, la confidenza non si mostra più", () => {
    expect(
      differenzeFraVersioni(
        versione([{ id: "gold", name: "Oro", bias: "RIALZISTA", conf: 51 }]).payload,
        versione([{ id: "gold", name: "Oro", bias: "RIALZISTA", conf: 44 }]).payload,
      ),
    ).toEqual([]);
  });

  it("bias e confidenza cambiati sullo stesso asset: si nomina solo il bias", () => {
    const out = differenzeFraVersioni(
      versione([{ id: "idx", name: "Indici", bias: "NEUTRALE", conf: 46 }]).payload,
      versione([{ id: "idx", name: "Indici", bias: "RIALZISTA", conf: 52 }]).payload,
    );
    expect(out).toEqual(["il bias di Indici è passato da NEUTRALE a RIALZISTA"]);
  });

  it("niente di cambiato → nessuna differenza, nemmeno con payload diversi altrove", () => {
    const prima = {
      assets: [{ id: "gold", name: "Oro", weekly: { biasLabel: "RIALZISTA", confidence: 51 } }],
      news: [{ title: "una" }],
    };
    const dopo = {
      assets: [{ id: "gold", name: "Oro", weekly: { biasLabel: "RIALZISTA", confidence: 51 } }],
      news: [{ title: "un'altra" }, { title: "e un'altra ancora" }],
    };
    /* Le news sono cambiate, i bias no: la riga non deve comparire. È
       esattamente la parsimonia che si è scelta — «il desk ha rispedito» non
       dà nessun vantaggio a chi legge. */
    expect(differenzeFraVersioni(prima, dopo)).toEqual([]);
  });

  it("il bias si confronta normalizzato: maiuscole e spazi non sono un cambiamento", () => {
    expect(
      differenzeFraVersioni(
        { assets: [{ id: "gold", weekly: { biasLabel: " rialzista " } }] },
        { assets: [{ id: "gold", weekly: { biasLabel: "RIALZISTA" } }] },
      ),
    ).toEqual([]);
  });

  it("un asset presente in una sola versione non produce frasi", () => {
    /* Limite dichiarato: i cambi di composizione hanno già due sorveglianti
       sul lato `biasRecord`, e in 23 report non sono mai successi. */
    expect(
      differenzeFraVersioni(
        versione([{ id: "gold", bias: "RIALZISTA", conf: 51 }]).payload,
        versione([
          { id: "gold", bias: "RIALZISTA", conf: 51 },
          { id: "oil", bias: "NEUTRALE", conf: 45 },
        ]).payload,
      ),
    ).toEqual([]);
  });

  it("un valore assente da una parte non si conta come cambiamento", () => {
    expect(
      differenzeFraVersioni(
        { assets: [{ id: "gold", weekly: { biasLabel: "RIALZISTA" } }] },
        { assets: [{ id: "gold", weekly: { biasLabel: "RIALZISTA", confidence: 51 } }] },
      ),
    ).toEqual([]);
  });

  it("payload illeggibili non lanciano mai", () => {
    expect(() => differenzeFraVersioni(null, undefined)).not.toThrow();
    expect(differenzeFraVersioni("stringa", 42)).toEqual([]);
    expect(differenzeFraVersioni({ assets: "boh" }, { assets: [null, 7] })).toEqual([]);
  });

  it("senza `id` l'asset non è appaiabile: nessuna frase inventata", () => {
    expect(
      differenzeFraVersioni(
        { assets: [{ ticker: "XAUUSD", weekly: { biasLabel: "RIALZISTA" } }] },
        { assets: [{ ticker: "XAUUSD", weekly: { biasLabel: "RIBASSISTA" } }] },
      ),
    ).toEqual([]);
  });
});

describe("revisioneDaDire — quando la riga compare, e quando tace", () => {
  const v1 = versione([{ id: "oil", name: "Petrolio", bias: "NEUTRALE", conf: 45 }], ARRIVO_1);
  const v2 = versione([{ id: "oil", name: "Petrolio", bias: "RIBASSISTA", conf: 45 }], ARRIVO_2);

  it("una sola versione: nessuna revisione da dire", () => {
    expect(revisioneDaDire(1, undefined, v1)).toBeNull();
  });

  it("due versioni con un bias cambiato: la riga c'è e si spiega da sola", () => {
    const r = revisioneDaDire(2, v1, v2);
    expect(r).not.toBeNull();
    expect(r!.numero).toBe(2);
    expect(r!.arrivatoIl).toBe(ARRIVO_2);
    expect(r!.frase).toBe("il bias di Petrolio è passato da NEUTRALE a RIBASSISTA");
  });

  it("due versioni identiche nei bias: la riga NON compare", () => {
    /* Il caso più comune di rispedizione — il desk rimanda lo stesso quadro
       con news aggiornate — non merita una riga. */
    expect(revisioneDaDire(2, v1, versione([{ id: "oil", name: "Petrolio", bias: "NEUTRALE", conf: 45 }]))).toBeNull();
  });

  it("il numero è quello della versione CORRENTE, non delle differenze", () => {
    expect(revisioneDaDire(4, v1, v2)!.numero).toBe(4);
  });

  it("oltre due cambiamenti la frase si accorcia e dichiara il resto", () => {
    const prima = versione([
      { id: "gold", name: "Oro", bias: "RIALZISTA", conf: 51 },
      { id: "oil", name: "Petrolio", bias: "NEUTRALE", conf: 45 },
      { id: "idx", name: "Indici", bias: "NEUTRALE", conf: 46 },
      { id: "eur", name: "Euro", bias: "NEUTRALE", conf: 50 },
    ]);
    const dopo = versione([
      { id: "gold", name: "Oro", bias: "RIBASSISTA", conf: 40 },
      { id: "oil", name: "Petrolio", bias: "RIBASSISTA", conf: 41 },
      { id: "idx", name: "Indici", bias: "RIALZISTA", conf: 52 },
      { id: "eur", name: "Euro", bias: "RIALZISTA", conf: 50 },
    ]);
    const r = revisioneDaDire(2, prima, dopo)!;
    // quattro bias cambiati; le confidenze cambiate non contano più
    expect(r.cambiamenti).toHaveLength(4);
    expect(r.frase).toContain("il bias di Oro");
    expect(r.frase).toContain("e altri 2 cambiamenti");
  });

  it("un solo cambiamento residuo si dice al singolare", () => {
    const prima = versione([
      { id: "gold", name: "Oro", bias: "RIALZISTA", conf: 51 },
      { id: "oil", name: "Petrolio", bias: "NEUTRALE", conf: 45 },
      { id: "idx", name: "Indici", bias: "NEUTRALE", conf: 46 },
    ]);
    const dopo = versione([
      { id: "gold", name: "Oro", bias: "RIBASSISTA", conf: 40 },
      { id: "oil", name: "Petrolio", bias: "RIBASSISTA", conf: 45 },
      { id: "idx", name: "Indici", bias: "RIALZISTA", conf: 46 },
    ]);
    const r = revisioneDaDire(2, prima, dopo)!;
    expect(r.cambiamenti).toHaveLength(3);
    expect(r.frase).toContain("e altri 1 cambiamento");
    expect(r.frase).not.toContain("cambiamenti");
  });

  it("versioni mancanti: nessuna riga, nessun crash", () => {
    expect(revisioneDaDire(2, undefined, v2)).toBeNull();
    expect(revisioneDaDire(2, v1, undefined)).toBeNull();
    expect(revisioneDaDire(0, undefined, undefined)).toBeNull();
  });
});
