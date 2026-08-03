import { describe, expect, it } from "vitest";
import {
  cumulativePathsByYear,
  dailyLogReturns,
  detrend,
  levelPathsByYear,
  logToPercent,
  monthlyLogReturns,
  monthlyMeanLevels,
  normalizeBars,
} from "@/lib/seasonality/series";

describe("normalizeBars", () => {
  it("ordina per data e deduplica tenendo l'ultimo valore visto", () => {
    const out = normalizeBars([
      { date: "2024-01-03", close: 3 },
      { date: "2024-01-01", close: 1 },
      { date: "2024-01-01", close: 1.5 },
    ]);
    expect(out).toEqual([
      { date: "2024-01-01", close: 1.5 },
      { date: "2024-01-03", close: 3 },
    ]);
  });

  it("scarta prezzi non positivi o non finiti (non sono prezzi)", () => {
    const out = normalizeBars([
      { date: "2024-01-01", close: 0 },
      { date: "2024-01-02", close: -5 },
      { date: "2024-01-03", close: Number.NaN },
      { date: "2024-01-04", close: 10 },
    ]);
    expect(out).toEqual([{ date: "2024-01-04", close: 10 }]);
  });
});

describe("dailyLogReturns", () => {
  it("la prima barra non produce rendimento", () => {
    const out = dailyLogReturns([
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 110 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2024-01-02");
    expect(out[0].r).toBeCloseTo(Math.log(1.1), 12);
  });

  it("i log-rendimenti si sommano (è il motivo per cui li usiamo)", () => {
    const out = dailyLogReturns([
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 110 },
      { date: "2024-01-03", close: 99 },
    ]);
    const somma = out[0].r + out[1].r;
    expect(somma).toBeCloseTo(Math.log(99 / 100), 12);
  });

  it("serie vuota o di una sola barra → nessun rendimento", () => {
    expect(dailyLogReturns([])).toEqual([]);
    expect(dailyLogReturns([{ date: "2024-01-01", close: 5 }])).toEqual([]);
  });
});

describe("logToPercent", () => {
  it("riporta il log a percentuale semplice", () => {
    expect(logToPercent(Math.log(1.1))).toBeCloseTo(10, 10);
    expect(logToPercent(Math.log(0.9))).toBeCloseTo(-10, 10);
    expect(logToPercent(0)).toBe(0);
  });
});

describe("monthlyLogReturns", () => {
  const bars = [
    { date: "2024-01-05", close: 100 },
    { date: "2024-01-31", close: 110 }, // chiusura di gennaio
    { date: "2024-02-10", close: 105 },
    { date: "2024-02-29", close: 121 }, // chiusura di febbraio
  ];

  it("usa la chiusura di fine mese contro quella del mese precedente", () => {
    const out = monthlyLogReturns(bars);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ year: 2024, month: 2 });
    expect(out[0].value).toBeCloseTo(Math.log(121 / 110), 12);
  });

  it("conta i giorni di quotazione del mese", () => {
    expect(monthlyLogReturns(bars)[0].days).toBe(2);
  });

  it("NON produce un rendimento a cavallo di un mese mancante", () => {
    // Marzo assente: senza guardia si otterrebbe un "rendimento di aprile"
    // che copre due mesi — un artefatto che sembrerebbe un dato.
    const out = monthlyLogReturns([
      { date: "2024-02-29", close: 100 },
      { date: "2024-04-30", close: 150 },
    ]);
    expect(out).toEqual([]);
  });

  it("attraversa correttamente il cambio d'anno (dicembre → gennaio)", () => {
    const out = monthlyLogReturns([
      { date: "2023-12-29", close: 100 },
      { date: "2024-01-31", close: 120 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ year: 2024, month: 1 });
    expect(out[0].value).toBeCloseTo(Math.log(1.2), 12);
  });

  it("un solo mese di dati non produce nessun rendimento", () => {
    expect(
      monthlyLogReturns([
        { date: "2024-01-05", close: 100 },
        { date: "2024-01-31", close: 110 },
      ]),
    ).toEqual([]);
  });
});

describe("monthlyMeanLevels", () => {
  it("media i livelli del mese e conta i giorni", () => {
    const out = monthlyMeanLevels([
      { date: "2024-01-02", close: 10 },
      { date: "2024-01-03", close: 20 },
      { date: "2024-02-01", close: 30 },
    ]);
    expect(out).toEqual([
      { year: 2024, month: 1, value: 15, days: 2 },
      { year: 2024, month: 2, value: 30, days: 1 },
    ]);
  });

  it("il primo mese esiste (nessun mese perso, a differenza dei rendimenti)", () => {
    const out = monthlyMeanLevels([{ date: "2020-06-01", close: 42 }]);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(42);
  });
});

describe("detrend", () => {
  it("la media delle osservazioni detrendizzate è zero", () => {
    const out = detrend([1, 2, 3, 10]);
    const somma = out.reduce((a, b) => a + b, 0);
    expect(somma).toBeCloseTo(0, 12);
  });

  it("conserva le differenze relative", () => {
    const out = detrend([1, 2, 3]);
    expect(out[1] - out[0]).toBeCloseTo(1, 12);
    expect(out).toEqual([-1, 0, 1]);
  });

  it("insieme vuoto → insieme vuoto, non un errore", () => {
    expect(detrend([])).toEqual([]);
  });
});

describe("cumulativePathsByYear", () => {
  it("cumula dal 1° gennaio e riporta il valore nei giorni chiusi", () => {
    const paths = cumulativePathsByYear([
      { date: "2024-01-03", r: 0.1 },
      { date: "2024-01-05", r: 0.2 },
    ]);
    const p = paths.get(2024)!;
    expect(p[1]).toBe(0); // prima della prima quotazione
    expect(p[2]).toBe(0);
    expect(p[3]).toBeCloseTo(0.1, 12);
    expect(p[4]).toBeCloseTo(0.1, 12); // giorno chiuso: riportato, non azzerato
    expect(p[5]).toBeCloseTo(0.3, 12);
    expect(p[366]).toBeCloseTo(0.3, 12); // fino a fine anno
  });

  it("separa gli anni", () => {
    const paths = cumulativePathsByYear([
      { date: "2023-06-01", r: 0.5 },
      { date: "2024-06-01", r: -0.2 },
    ]);
    expect(paths.size).toBe(2);
    expect(paths.get(2023)![366]).toBeCloseTo(0.5, 12);
    expect(paths.get(2024)![366]).toBeCloseTo(-0.2, 12);
  });

  it("il 1° marzo cade al giorno 61 nel bisestile e 60 altrimenti", () => {
    const bis = cumulativePathsByYear([{ date: "2024-03-01", r: 0.1 }]).get(2024)!;
    const non = cumulativePathsByYear([{ date: "2023-03-01", r: 0.1 }]).get(2023)!;
    expect(bis[60]).toBe(0);
    expect(bis[61]).toBeCloseTo(0.1, 12);
    expect(non[59]).toBe(0);
    expect(non[60]).toBeCloseTo(0.1, 12);
  });
});

describe("levelPathsByYear", () => {
  it("riporta il livello, non lo cumula", () => {
    const p = levelPathsByYear([
      { date: "2024-01-03", close: 20 },
      { date: "2024-01-05", close: 25 },
    ]).get(2024)!;
    expect(Number.isNaN(p[1])).toBe(true); // prima del primo dato: sconosciuto, non 0
    expect(p[3]).toBe(20);
    expect(p[4]).toBe(20);
    expect(p[5]).toBe(25);
    expect(p[366]).toBe(25);
  });
});
