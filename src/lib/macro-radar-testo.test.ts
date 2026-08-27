import { describe, expect, it } from "vitest";
import {
  chiDallaFonte,
  domenicaOnOrBefore,
  etichettaArea,
  giorniFinestra,
  normalizzaAccenti,
  settimaneNonVerificabili,
  statoDelleAree,
} from "./macro-radar-testo";

/** "YYYY-MM-DD" → Date a mezzanotte UTC, come le colonne @db.Date. */
function d(chiave: string): Date {
  return new Date(`${chiave}T00:00:00.000Z`);
}

describe("normalizzaAccenti", () => {
  it("rimette gli accenti sulle parole scritte con l'apostrofo sostitutivo", () => {
    expect(normalizzaAccenti("gia' negoziabili")).toBe("già negoziabili");
    expect(normalizzaAccenti("granularita' dieci volte piu' fine")).toBe(
      "granularità dieci volte più fine",
    );
    expect(normalizzaAccenti("il comunicato e' del 3 agosto")).toBe(
      "il comunicato è del 3 agosto",
    );
    expect(normalizzaAccenti("perche' non modifica")).toBe("perché non modifica");
    expect(normalizzaAccenti("ne' limitazioni tecniche")).toBe("né limitazioni tecniche");
    expect(normalizzaAccenti("provision di liquidita' concentrata")).toBe(
      "provision di liquidità concentrata",
    );
    expect(normalizzaAccenti("run eseguito giovedi' 27 agosto")).toBe(
      "run eseguito giovedì 27 agosto",
    );
  });

  it("NON tocca le elisioni legittime, che sono la maggioranza degli apostrofi", () => {
    const intatti = [
      "la pagina non espone l'elenco",
      "dell'analisi e dell'esecuzione",
      "un'altra fonte",
      "aspetta un po'",
      "l'indice, d'accordo, all'apertura",
    ];
    for (const testo of intatti) expect(normalizzaAccenti(testo)).toBe(testo);
  });

  it("conserva la maiuscola iniziale", () => {
    expect(normalizzaAccenti("Gia' attivo")).toBe("Già attivo");
    expect(normalizzaAccenti("E' cambiato")).toBe("È cambiato");
  });

  it("lascia intatto un testo che ha già gli accenti veri (i report futuri)", () => {
    const futuro = "È già più chiaro perché la liquidità è cambiata giovedì";
    expect(normalizzaAccenti(futuro)).toBe(futuro);
  });
});

describe("domenicaOnOrBefore", () => {
  it("porta il run di giovedì alla domenica che ha aperto la settimana", () => {
    // Il caso del collaudo: run giovedì 27/08/2026 → settimana del 23, non del 30.
    expect(domenicaOnOrBefore("2026-08-27")).toBe("2026-08-23");
  });

  it("lascia ferma una domenica", () => {
    expect(domenicaOnOrBefore("2026-08-23")).toBe("2026-08-23");
    expect(domenicaOnOrBefore("2026-08-30")).toBe("2026-08-30");
  });

  it("attraversa il confine di mese e di anno", () => {
    expect(domenicaOnOrBefore("2026-09-01")).toBe("2026-08-30");
    expect(domenicaOnOrBefore("2027-01-01")).toBe("2026-12-27");
  });
});

describe("chiDallaFonte", () => {
  it("legge il soggetto dal nome della fonte", () => {
    expect(
      chiDallaFonte("CME Group - Special Executive Report SER-9789 (24 ago 2026)"),
    ).toBe("CME Group");
    expect(chiDallaFonte("FTMO - Product News (26 ago 2026)")).toBe("FTMO");
    expect(chiDallaFonte("TradingView Blog - Alerts (21 ago 2026)")).toBe(
      "TradingView Blog",
    );
  });

  it("senza separatore tiene il nome intero, togliendo solo la data in coda", () => {
    expect(chiDallaFonte("Bundesbank (12 ago 2026)")).toBe("Bundesbank");
    expect(chiDallaFonte("CFTC")).toBe("CFTC");
  });

  it("assente o vuoto → null, non una stringa vuota", () => {
    expect(chiDallaFonte(null)).toBeNull();
    expect(chiDallaFonte(undefined)).toBeNull();
    expect(chiDallaFonte("   ")).toBeNull();
  });
});

describe("etichettaArea", () => {
  it("rende la PAROLA, mai la lettera: la sigla è del payload, non di chi legge", () => {
    expect(etichettaArea("A")).toBe("Prop firm");
    expect(etichettaArea("B")).toBe("Borse");
    expect(etichettaArea("C")).toBe("Broker");
    expect(etichettaArea("D")).toBe("Regole");
    expect(etichettaArea("E")).toBe("Piattaforme");
    expect(etichettaArea("F")).toBe("Dati");
    expect(etichettaArea("G")).toBe("Ricerca");
  });

  it("un'area ignota resta la sua lettera: non si inventa un nome", () => {
    expect(etichettaArea("H")).toBe("H");
  });
});

describe("giorniFinestra", () => {
  /* Il difetto: «3 ago – 9 ago 2026 · 6 giorni». Sono sette, e la pagina lo
     diceva su OGNI settimana normale. Estremi compresi, sempre. */
  it("una settimana piena fa sette giorni, non sei", () => {
    expect(giorniFinestra(d("2026-08-03"), d("2026-08-09"))).toBe(7);
  });

  it("la finestra estesa del collaudo fa quindici giorni, non quattordici", () => {
    expect(giorniFinestra(d("2026-08-13"), d("2026-08-27"))).toBe(15);
  });

  it("un giorno solo fa un giorno", () => {
    expect(giorniFinestra(d("2026-08-09"), d("2026-08-09"))).toBe(1);
  });

  it("regge il confine di mese e di anno", () => {
    expect(giorniFinestra(d("2026-08-31"), d("2026-09-01"))).toBe(2);
    expect(giorniFinestra(d("2026-12-28"), d("2027-01-03"))).toBe(7);
  });
});

describe("statoDelleAree", () => {
  const base = {
    vociPerArea: { A: 2, B: 1 },
    vuote: ["D", "E"],
    cieche: [{ area: "C", reason: "nessun canale enumerabile" }],
    settimaneCieche: { C: 4 },
  };

  it("torna SEMPRE tutte e sette le aree, in ordine", () => {
    const aree = statoDelleAree(base);
    expect(aree.map((a) => a.area)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("l'area che il payload non nomina risulta NON DICHIARATA, non vuota", () => {
    const aree = statoDelleAree(base);
    const f = aree.find((a) => a.area === "F")!;
    const g = aree.find((a) => a.area === "G")!;
    // È il difetto più grave dell'audit: prima F e G sparivano e basta.
    expect(f.dichiarata).toBe(false);
    expect(f.vuota).toBe(false);
    expect(g.dichiarata).toBe(false);
  });

  it("un'area vuota è dichiarata, e non va confusa con una non dichiarata", () => {
    const d1 = statoDelleAree(base).find((a) => a.area === "D")!;
    expect(d1.vuota).toBe(true);
    expect(d1.dichiarata).toBe(true);
    expect(d1.cieca).toBeNull();
  });

  it("un'area cieca porta il motivo e da quante settimane lo è", () => {
    const c = statoDelleAree(base).find((a) => a.area === "C")!;
    expect(c.cieca).toEqual({ motivo: "nessun canale enumerabile", settimane: 4 });
  });

  it("cieca E con voci convivono: si può trovare qualcosa senza vedere l'elenco", () => {
    const aree = statoDelleAree({
      ...base,
      vociPerArea: { ...base.vociPerArea, C: 1 },
    });
    const c = aree.find((a) => a.area === "C")!;
    expect(c.cieca).not.toBeNull();
    expect(c.voci).toBe(1);
  });

  it("un'area fuori dalle sette non viene persa: si aggiunge in coda", () => {
    const aree = statoDelleAree({ ...base, vuote: [...base.vuote, "H"] });
    expect(aree.map((a) => a.area)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });
});

describe("settimaneNonVerificabili", () => {
  const settimane = [
    { weekOf: "2026-09-06", aree: ["B", "C"] },
    { weekOf: "2026-08-30", aree: ["B", "C", "F"] },
    { weekOf: "2026-08-23", aree: ["B", "C", "F"] },
    { weekOf: "2026-08-16", aree: ["C"] },
  ];

  it("conta le settimane consecutive all'indietro dalla corrente", () => {
    const conteggi = settimaneNonVerificabili(settimane, "2026-09-06");
    // B: cieca il 6, il 30 e il 23; il 16 no → 3.
    expect(conteggi.get("B")).toBe(3);
    // C: cieca in tutte e quattro.
    expect(conteggi.get("C")).toBe(4);
  });

  it("un'area verificabile nella settimana corrente non compare", () => {
    const conteggi = settimaneNonVerificabili(settimane, "2026-09-06");
    expect(conteggi.has("F")).toBe(false);
  });

  it("la catena si spezza e non riparte: una lettura riuscita azzera", () => {
    // Guardando dal 30, F è cieca il 30 e il 23 ma non il 16 → 2.
    const conteggi = settimaneNonVerificabili(settimane, "2026-08-30");
    expect(conteggi.get("F")).toBe(2);
  });

  it("la prima settimana in assoluto vale 1, non 0: è comunque una settimana", () => {
    const conteggi = settimaneNonVerificabili(
      [{ weekOf: "2026-08-23", aree: ["B"] }],
      "2026-08-23",
    );
    expect(conteggi.get("B")).toBe(1);
  });

  it("una settimana sconosciuta non produce conteggi inventati", () => {
    expect(settimaneNonVerificabili(settimane, "2026-07-05").size).toBe(0);
  });
});
