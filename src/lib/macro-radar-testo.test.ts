import { describe, expect, it } from "vitest";
import {
  chiDallaFonte,
  domenicaOnOrBefore,
  etichettaArea,
  normalizzaAccenti,
  settimaneNonVerificabili,
} from "./macro-radar-testo";

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
  it("nomina le aree note", () => {
    expect(etichettaArea("B")).toBe("B · Borse e strumenti quotati");
    expect(etichettaArea("G")).toBe("G · Letture e ricerca");
  });

  it("un'area ignota resta la sua lettera: non si inventa un nome", () => {
    expect(etichettaArea("H")).toBe("H");
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
