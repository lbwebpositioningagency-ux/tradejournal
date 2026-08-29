import { describe, expect, it } from "vitest";
import {
  anniConDatiPerFinestra,
  anniSenzaOsservazioni,
  spiegaCopertura,
  windowCoverage,
  type WindowCoverage,
} from "@/lib/seasonality/copertura";

/* Tutti i casi sono ancorati alla vicenda vera: finestra 20 anni, ultimo anno
   completo 2025, quindi 2006-2025. Il 2005 sparito non tolse nessun anno alla
   finestra tranne il gennaio 2006, che ha bisogno del dicembre precedente. */
const LCY = 2025;
const FINESTRE = [20, 15, 10, 5, 2] as const;

describe("windowCoverage", () => {
  it("senza misura sui dati ricade sulla lunghezza della storia", () => {
    const [venti] = windowCoverage({
      lookbacks: [20],
      completeYears: 27,
      lastComplete: LCY,
    });
    expect(venti.available).toBe(20);
    expect(venti.perStoria).toBe(20);
    expect(venti.truncated).toBe(false);
  });

  it("dichiara gli anni civili della finestra", () => {
    const c = windowCoverage({
      lookbacks: [...FINESTRE],
      completeYears: 27,
      lastComplete: LCY,
    });
    expect(c.map((w) => [w.from, w.to])).toEqual([
      [2006, 2025],
      [2011, 2025],
      [2016, 2025],
      [2021, 2025],
      [2024, 2025],
    ]);
  });

  it("una serie più giovane della finestra è troncata, senza buchi", () => {
    // VIX9D comincia nel 2011: quindici anni completi, non venti.
    const [venti] = windowCoverage({
      lookbacks: [20],
      completeYears: 15,
      lastComplete: LCY,
    });
    expect(venti.perStoria).toBe(15);
    expect(venti.available).toBe(15);
    expect(venti.buchi).toBe(0);
    expect(venti.truncated).toBe(true);
  });

  it("IL CASO CHE PRIMA TACEVA: storia lunga, buchi dentro", () => {
    /* L'oro partiva dal 1999 — ventisette anni completi — eppure in pagina
       `n` diceva 17. Con la sola lunghezza `truncated` restava falso. */
    const [venti] = windowCoverage({
      lookbacks: [20],
      completeYears: 27,
      lastComplete: LCY,
      anniConDati: new Map([[20, 17]]),
    });
    expect(venti.perStoria).toBe(20);
    expect(venti.available).toBe(17);
    expect(venti.buchi).toBe(3);
    expect(venti.truncated).toBe(true);
  });

  it("storia corta E buchi si sommano senza contarsi due volte", () => {
    const [venti] = windowCoverage({
      lookbacks: [20],
      completeYears: 15,
      lastComplete: LCY,
      anniConDati: new Map([[20, 13]]),
    });
    expect(venti.perStoria).toBe(15);
    expect(venti.available).toBe(13);
    expect(venti.buchi).toBe(2);
  });

  it("una misura più alta della finestra non gonfia la copertura", () => {
    const [due] = windowCoverage({
      lookbacks: [2],
      completeYears: 27,
      lastComplete: LCY,
      anniConDati: new Map([[2, 9]]),
    });
    expect(due.available).toBe(2);
    expect(due.buchi).toBe(0);
    expect(due.truncated).toBe(false);
  });

  it("senza storia la copertura è zero, non NaN", () => {
    const [venti] = windowCoverage({
      lookbacks: [20],
      completeYears: null,
      lastComplete: LCY,
    });
    expect(venti.perStoria).toBe(0);
    expect(venti.available).toBe(0);
    expect(venti.truncated).toBe(true);
  });
});

describe("anniConDatiPerFinestra", () => {
  it("prende il MASSIMO n, non il minimo", () => {
    /* Gennaio ha un anno in meno perché gli serve il dicembre precedente:
       è una ragione legittima e non deve accorciare la finestra intera. */
    const byWindow = new Map([
      [20, [{ n: 19 }, { n: 20 }, { n: 20 }]],
      [5, [{ n: 4 }, { n: 5 }]],
    ]);
    expect(anniConDatiPerFinestra(byWindow)).toEqual(
      new Map([
        [20, 20],
        [5, 5],
      ]),
    );
  });

  it("una finestra senza bucket vale zero", () => {
    expect(anniConDatiPerFinestra(new Map([[10, []]]))).toEqual(
      new Map([[10, 0]]),
    );
  });
});

describe("anniSenzaOsservazioni", () => {
  const years = [2026, 2025, 2024, 2023, 2022];

  it("nomina gli anni senza nemmeno una cella", () => {
    const cells = [
      { year: 2026 },
      { year: 2025 },
      { year: 2023 },
      { year: 2022 },
    ];
    expect(anniSenzaOsservazioni({ cells, years }, LCY)).toEqual([2024]);
  });

  it("l'anno in corso non è un buco: è parziale per definizione", () => {
    const cells = [{ year: 2025 }, { year: 2024 }, { year: 2023 }, { year: 2022 }];
    expect(anniSenzaOsservazioni({ cells, years }, LCY)).toEqual([]);
  });

  it("restituisce gli anni in ordine crescente", () => {
    const cells = [{ year: 2025 }, { year: 2022 }];
    expect(anniSenzaOsservazioni({ cells, years }, LCY)).toEqual([2023, 2024]);
  });
});

describe("spiegaCopertura", () => {
  const base: WindowCoverage = {
    lookbackYears: 20,
    requested: 20,
    available: 20,
    perStoria: 20,
    buchi: 0,
    from: 2006,
    to: 2025,
    truncated: false,
  };

  it("una finestra piena non merita un asterisco", () => {
    expect(spiegaCopertura(base)).toBeNull();
  });

  it("storia corta: dice da quando comincia", () => {
    const testo = spiegaCopertura({
      ...base,
      available: 15,
      perStoria: 15,
      truncated: true,
    });
    expect(testo).toBe("La storia comincia nel 2011: 15 anni su 20 richiesti.");
  });

  it("buchi in una storia lunga: dice quanti e in quale finestra", () => {
    const testo = spiegaCopertura({
      ...base,
      available: 17,
      buchi: 3,
      truncated: true,
    });
    expect(testo).toBe(
      "3 anni della finestra 2006-2025 non hanno dati: dietro questi numeri ci sono 17 anni su 20.",
    );
  });

  it("con i nomi degli anni, li elenca", () => {
    const testo = spiegaCopertura(
      { ...base, available: 17, buchi: 3, truncated: true },
      [2005, 2011, 2012],
    );
    expect(testo).toContain("(2005, 2011, 2012)");
  });

  it("un solo anno mancante resta al singolare", () => {
    const testo = spiegaCopertura({
      ...base,
      available: 19,
      buchi: 1,
      truncated: true,
    });
    expect(testo).toBe(
      "1 anno della finestra 2006-2025 non ha dati: dietro questi numeri ci sono 19 anni su 20.",
    );
  });

  it("storia corta e buchi insieme: entrambe le cause, distinte", () => {
    const testo = spiegaCopertura({
      ...base,
      available: 13,
      perStoria: 15,
      buchi: 2,
      truncated: true,
    });
    expect(testo).toBe(
      "La storia comincia nel 2011 (15 anni su 20), e 2 anni della finestra 2006-2025 non hanno dati: ne restano 13.",
    );
  });
});
