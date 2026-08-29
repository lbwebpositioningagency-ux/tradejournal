import { describe, expect, it } from "vitest";
import {
  confrontaImpronte,
  formaCanonica,
  improntaUguale,
  sospette,
  stessoNumero,
  type ImprontaSerie,
} from "@/lib/seasonality/impronta";

/** L'oro come stava la sera del 28/08, prima che il giro delle 04:21 lo mutilasse. */
function base(): ImprontaSerie {
  return {
    barre: 8258,
    primaData: "1999-06-03",
    ultimaData: "2026-08-27",
    finestre: [
      {
        lookbackYears: 20,
        mesi: [
          { bucket: 1, n: 20, media: 0.0347 },
          { bucket: 2, n: 20, media: 0.00866 },
          { bucket: 3, n: 20, media: 0.00608 },
        ],
        fineAnno: 0.10628478,
      },
      {
        lookbackYears: 5,
        mesi: [
          { bucket: 1, n: 5, media: 0.0136 },
          { bucket: 2, n: 5, media: -0.0075 },
        ],
        fineAnno: 0.16445454,
      },
    ],
  };
}

describe("stessoNumero", () => {
  it("ignora il rumore oltre l'ottavo decimale, che il database non memorizza", () => {
    expect(stessoNumero(0.164454541, 0.164454542)).toBe(true);
  });

  it("non ignora una differenza all'ottavo decimale", () => {
    expect(stessoNumero(0.16445454, 0.16445455)).toBe(false);
  });
});

describe("formaCanonica", () => {
  it("non dipende dall'ordine delle finestre né dei bucket", () => {
    const a = base();
    const b = base();
    b.finestre.reverse();
    b.finestre.forEach((f) => f.mesi.reverse());
    expect(formaCanonica(a)).toBe(formaCanonica(b));
    expect(improntaUguale(a, b)).toBe(true);
  });

  it("cambia se cambia un solo valore", () => {
    const a = base();
    const b = base();
    b.finestre[0].mesi[0].media = 0.0348;
    expect(improntaUguale(a, b)).toBe(false);
  });
});

describe("confrontaImpronte — nessuna variazione", () => {
  it("due impronte identiche non producono niente", () => {
    expect(confrontaImpronte(base(), base())).toEqual([]);
  });
});

describe("confrontaImpronte — la serie grezza", () => {
  it("IL CASO DEL 26/08: le barre scendono ed è sospetto", () => {
    const dopo = base();
    dopo.barre = 7944;
    const v = confrontaImpronte(base(), dopo);
    expect(sospette(v)).toContain(
      "barre scese da 8258 a 7944 (314 sedute perse)",
    );
  });

  it("una barra in più ogni giorno è normale, non un allarme", () => {
    const dopo = base();
    dopo.barre = 8259;
    dopo.ultimaData = "2026-08-28";
    expect(sospette(confrontaImpronte(base(), dopo))).toEqual([]);
  });

  it("la storia che comincia più tardi è una perdita", () => {
    const dopo = base();
    dopo.primaData = "2000-01-03";
    expect(sospette(confrontaImpronte(base(), dopo))).toContain(
      "la storia comincia più tardi: 1999-06-03 → 2000-01-03",
    );
  });

  it("la storia che comincia prima è un recupero, non un guasto", () => {
    const dopo = base();
    dopo.primaData = "1998-01-02";
    expect(sospette(confrontaImpronte(base(), dopo))).toEqual([]);
  });

  it("la coda che arretra è sospetta", () => {
    const dopo = base();
    dopo.ultimaData = "2023-12-29";
    expect(sospette(confrontaImpronte(base(), dopo))).toContain(
      "la serie si ferma prima: 2026-08-27 → 2023-12-29",
    );
  });
});

describe("confrontaImpronte — LA REGOLA CHIAVE: media cambiata a n invariato", () => {
  it("stesso campione e risposta diversa: sospetta, senza soglie", () => {
    const dopo = base();
    dopo.finestre[0].mesi[0].media = 0.0318;
    const s = sospette(confrontaImpronte(base(), dopo));
    expect(s).toHaveLength(1);
    expect(s[0]).toBe(
      "20 anni, bucket 1: media cambiata da 0.034700 a 0.031800 a n INVARIATO (20)",
    );
  });

  it("anche una differenza minuscola conta: non è una questione di quanto", () => {
    const dopo = base();
    dopo.finestre[0].mesi[0].media = 0.03470001;
    expect(sospette(confrontaImpronte(base(), dopo))).toHaveLength(1);
  });

  it("se n è cambiato, la media DOVEVA cambiare: nessun allarme sul valore", () => {
    const dopo = base();
    dopo.finestre[0].mesi[0].n = 19;
    dopo.finestre[0].mesi[0].media = 0.0318;
    const v = confrontaImpronte(base(), dopo);
    // Resta sospetto il CALO di n, non il movimento della media.
    expect(sospette(v)).toEqual(["20 anni, bucket 1: n sceso da 20 a 19"]);
  });

  it("n che sale con la media che si sposta: tutto atteso", () => {
    const dopo = base();
    dopo.finestre[0].mesi[0].n = 21;
    dopo.finestre[0].mesi[0].media = 0.0355;
    expect(sospette(confrontaImpronte(base(), dopo))).toEqual([]);
    expect(confrontaImpronte(base(), dopo)).toHaveLength(1);
  });

  it("un bucket sparito è sempre sospetto", () => {
    const dopo = base();
    dopo.finestre[0].mesi = dopo.finestre[0].mesi.slice(1);
    expect(sospette(confrontaImpronte(base(), dopo))).toContain(
      "20 anni: il bucket 1 è sparito (aveva n=20)",
    );
  });

  it("la regola vale su tutte le finestre, non solo sulla selezionata", () => {
    const dopo = base();
    dopo.finestre[1].mesi[1].media = 0.0;
    const s = sospette(confrontaImpronte(base(), dopo));
    expect(s).toHaveLength(1);
    expect(s[0]).toContain("5 anni, bucket 2");
  });
});

describe("confrontaImpronte — il percorso", () => {
  it("si muove con le medie: atteso", () => {
    const dopo = base();
    dopo.finestre[0].mesi[0].n = 21;
    dopo.finestre[0].mesi[0].media = 0.0355;
    dopo.finestre[0].fineAnno = 0.111;
    expect(sospette(confrontaImpronte(base(), dopo))).toEqual([]);
  });

  it("si muove da solo, con mesi e n identici: sospetto", () => {
    const dopo = base();
    dopo.finestre[0].fineAnno = 0.111;
    const s = sospette(confrontaImpronte(base(), dopo));
    expect(s).toHaveLength(1);
    expect(s[0]).toBe(
      "20 anni: percorso di fine anno da 0.106285 a 0.111000, ma mesi e n sono identici",
    );
  });

  it("sparire è un caso di cambiamento, non un'assenza di cambiamento", () => {
    const dopo = base();
    dopo.finestre[1].fineAnno = null;
    expect(sospette(confrontaImpronte(base(), dopo))).toHaveLength(1);
  });
});

describe("confrontaImpronte — casi limite", () => {
  it("una finestra nuova non ha un prima con cui confrontarsi", () => {
    const prima = base();
    const dopo = base();
    dopo.finestre.push({ lookbackYears: 2, mesi: [{ bucket: 1, n: 2, media: 0.05 }], fineAnno: 0.3 });
    expect(confrontaImpronte(prima, dopo)).toEqual([]);
  });

  it("date nulle non generano frasi senza senso", () => {
    const prima = base();
    prima.primaData = null;
    const dopo = base();
    expect(confrontaImpronte(prima, dopo)).toEqual([]);
  });

  it("più guasti insieme escono tutti, non solo il primo", () => {
    const dopo = base();
    dopo.barre = 7944;
    dopo.finestre[0].mesi[0].n = 17;
    dopo.finestre[1].mesi[0].media = 0.02;
    expect(sospette(confrontaImpronte(base(), dopo))).toHaveLength(3);
  });
});
