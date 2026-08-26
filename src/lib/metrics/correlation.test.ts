import { describe, expect, it } from "vitest";
import {
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

  it("sotto le giornate minime NON calcola: il numero descriverebbe il caso", () => {
    expect(CORRELATION_MIN_DAYS).toBe(30);
    const corta = correlationMatrix([
      serie("a", days(29, (i) => i)),
      serie("b", days(29, (i) => i)),
    ]).pairs.get(pairKey("a", "b"))!;
    expect(corta.lowSample).toBe(true);
    expect(corta.r).toBeNull();
    expect(corta.days).toBe(29);
  });

  it("una serie piatta → null, mai uno zero che si legge «indipendenti»", () => {
    const m = correlationMatrix([
      serie("a", days(40, () => 100)),
      serie("b", days(40, (i) => i)),
    ]);
    expect(m.pairs.get(pairKey("a", "b"))!.r).toBeNull();
    expect(m.pairs.get(pairKey("a", "b"))!.lowSample).toBe(false);
  });

  it("calendario comune: i giorni della sola altra serie contano come zero", () => {
    // "a" opera 40 giorni, "b" solo i primi 5: sui restanti 35 "b" vale 0, e
    // il calendario comune è di 40 giorni, non di 5.
    const a = serie("a", days(40, (i) => i + 1));
    const tuttiIGiorni = Object.keys(days(40, () => 0));
    const b = serie(
      "b",
      Object.fromEntries(tuttiIGiorni.slice(0, 5).map((d, i) => [d, i + 1])),
    );
    const pair = correlationMatrix([a, b]).pairs.get(pairKey("a", "b"))!;
    expect(pair.days).toBe(40);
    expect(pair.r).not.toBeNull();
  });

  it("i giorni in cui NESSUNA opera non entrano: allungherebbero la serie e basta", () => {
    const a = serie("a", days(35, (i) => i));
    const b = serie("b", days(35, (i) => i * 2));
    expect(correlationMatrix([a, b]).pairs.get(pairKey("a", "b"))!.days).toBe(35);
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

  it("la lettura in parole usa il VALORE ASSOLUTO: −0,8 è alta quanto +0,8", () => {
    expect(correlationTone("0.8000")).toBe("alta");
    expect(correlationTone("-0.8000")).toBe("alta");
    expect(correlationTone("0.4000")).toBe("media");
    expect(correlationTone("0.1000")).toBe("bassa");
    expect(correlationTone(null)).toBeNull();
  });
});
