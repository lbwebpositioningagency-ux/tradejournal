import { describe, expect, it } from "vitest";
import {
  correlationEligible,
  correlationMatrix,
  correlationTone,
  CORRELATION_MIN_DAYS,
  pairKey,
  type CorrelationSeries,
} from "./correlation";

function serie(key: string, values: Record<string, number>): CorrelationSeries {
  return {
    key,
    label: key,
    byDay: new Map(Object.entries(values).map(([d, v]) => [d, v.toFixed(2)])),
    trades: Object.keys(values).length,
  };
}

/** `n` giorni consecutivi con i valori dati da `f`. */
function days(n: number, f: (i: number) => number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `2026-01-${String((i % 28) + 1).padStart(2, "0")}-${Math.floor(i / 28)}`,
      f(i),
    ]),
  );
}

describe("correlationMatrix — P&L giornalieri di due strategie", () => {
  it("serie identiche → correlazione +1 esatta", () => {
    const values = days(40, (i) => Math.sin(i) * 100);
    const m = correlationMatrix([serie("a", values), serie("b", values)]);
    expect(Number(m.pairs.get(pairKey("a", "b"))!.r)).toBeCloseTo(1, 6);
  });

  it("serie opposte → correlazione −1 esatta", () => {
    const values = days(40, (i) => Math.sin(i) * 100);
    const opposte = Object.fromEntries(
      Object.entries(values).map(([d, v]) => [d, -v]),
    );
    const m = correlationMatrix([serie("a", values), serie("b", opposte)]);
    expect(Number(m.pairs.get(pairKey("a", "b"))!.r)).toBeCloseTo(-1, 6);
  });

  it("sotto i giorni in comune minimi NON calcola: il numero descriverebbe il caso", () => {
    expect(CORRELATION_MIN_DAYS).toBe(30);
    const corta = correlationMatrix([
      serie("a", days(29, (i) => i)),
      serie("b", days(29, (i) => i)),
    ]).pairs.get(pairKey("a", "b"))!;
    expect(corta.lowSample).toBe(true);
    expect(corta.r).toBeNull();
    expect(corta.noiseBand).toBeNull();
    expect(corta.commonDays).toBe(29);
  });

  it("a soglia esatta calcola, e dichiara la banda di rumore 1,96/√n", () => {
    const pair = correlationMatrix([
      serie("a", days(30, (i) => i)),
      serie("b", days(30, (i) => i * 3)),
    ]).pairs.get(pairKey("a", "b"))!;
    expect(pair.lowSample).toBe(false);
    expect(pair.r).toBe("1.0000");
    expect(pair.noiseBand).toBe("0.3578");
  });

  it("una serie piatta → null, mai uno zero che si legge «indipendenti»", () => {
    const m = correlationMatrix([
      serie("a", days(40, () => 100)),
      serie("b", days(40, (i) => i)),
    ]);
    expect(m.pairs.get(pairKey("a", "b"))!.r).toBeNull();
    expect(m.pairs.get(pairKey("a", "b"))!.lowSample).toBe(false);
  });

  it("molti giorni di unione ma pochi in comune → nessun coefficiente", () => {
    // "a" opera 40 giorni, "b" solo i primi 5: l'unione è 40, ma le due hanno
    // potuto muoversi insieme soltanto 5 volte.
    const a = serie("a", days(40, (i) => i + 1));
    const tuttiIGiorni = Object.keys(days(40, () => 0));
    const b = serie(
      "b",
      Object.fromEntries(tuttiIGiorni.slice(0, 5).map((d, i) => [d, i + 1])),
    );
    const pair = correlationMatrix([a, b]).pairs.get(pairKey("a", "b"))!;
    expect(pair.unionDays).toBe(40);
    expect(pair.commonDays).toBe(5);
    expect(pair.lowSample).toBe(true);
    expect(pair.r).toBeNull();
  });

  it("il coefficiente usa l'unione con lo zero dove una sola opera", () => {
    // 30 giorni in comune identici, più 10 giorni della sola "a" a +50: con
    // lo zero di "b" in quei giorni il legame si indebolisce, non resta 1.
    const comuni = days(30, (i) => (i % 2 === 0 ? 100 : -100));
    const extra = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`2027-02-${String(i + 1).padStart(2, "0")}`, 50]),
    );
    const pair = correlationMatrix([
      serie("a", { ...comuni, ...extra }),
      serie("b", comuni),
    ]).pairs.get(pairKey("a", "b"))!;
    expect(pair.commonDays).toBe(30);
    expect(pair.unionDays).toBe(40);
    expect(Number(pair.r)).toBeLessThan(1);
    expect(Number(pair.r)).toBeGreaterThan(0.9);
  });

  it("i giorni in cui NESSUNA opera non entrano: allungherebbero la serie e basta", () => {
    const a = serie("a", days(35, (i) => i));
    const b = serie("b", days(35, (i) => i * 2));
    expect(correlationMatrix([a, b]).pairs.get(pairKey("a", "b"))!.unionDays).toBe(35);
  });

  it("la chiave della coppia non dipende dall'ordine", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });

  it("tre serie producono tre coppie, mai la diagonale né i doppioni", () => {
    const m = correlationMatrix([
      serie("a", days(40, (i) => i)),
      serie("b", days(40, (i) => -i)),
      serie("c", days(40, (i) => i % 7)),
    ]);
    expect(m.pairs.size).toBe(3);
    expect(m.keys).toEqual(["a", "b", "c"]);
    expect(m.pairs.has(pairKey("a", "a"))).toBe(false);
  });

  it("una serie sola non produce nessuna coppia", () => {
    expect(correlationMatrix([serie("a", days(40, (i) => i))]).pairs.size).toBe(0);
  });

  it("una strategia con meno giorni operati della soglia non può entrare in matrice", () => {
    expect(correlationEligible(serie("a", days(29, (i) => i)))).toBe(false);
    expect(correlationEligible(serie("a", days(30, (i) => i)))).toBe(true);
  });
});

describe("correlationTone — la lettura tiene il SEGNO e il rumore", () => {
  const band = "0.3578"; // 30 giorni in comune

  it("dentro la banda di rumore non si legge nessun verso", () => {
    expect(correlationTone({ r: "0.3000", noiseBand: band })).toBe("rumore");
    expect(correlationTone({ r: "-0.3000", noiseBand: band })).toBe("rumore");
  });

  it("+0,8 e −0,8 sono opposti: la prima moltiplica il rischio, la seconda lo copre", () => {
    expect(correlationTone({ r: "0.8000", noiseBand: band })).toBe("insieme-forte");
    expect(correlationTone({ r: "-0.8000", noiseBand: band })).toBe("opposte");
  });

  it("positiva fuori dal rumore ma sotto 0,6 → insieme", () => {
    expect(correlationTone({ r: "0.4500", noiseBand: band })).toBe("insieme");
  });

  it("con più giorni la banda si stringe e lo stesso valore diventa leggibile", () => {
    expect(correlationTone({ r: "0.2500", noiseBand: "0.1960" })).toBe("insieme"); // 100 giorni
  });

  it("nessun coefficiente → nessuna lettura", () => {
    expect(correlationTone({ r: null, noiseBand: null })).toBeNull();
  });
});
