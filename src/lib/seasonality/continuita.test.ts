import { describe, expect, it } from "vitest";
import { mesiSenzaSedute } from "./continuita";
import type { DailyBar } from "./series";

/**
 * La sentinella che mancava il 26/08/2026, quando tutto il 2005 dell'oro è
 * sparito e il job è finito verde. I casi qui sotto sono quelli che quel
 * giorno avrebbero dovuto scattare, più quelli che NON devono scattare — che
 * sono la metà più importante: una sentinella che grida al lupo per un mese
 * di bordo viene disattivata, e a quel punto non protegge da niente.
 */

const barra = (date: string): DailyBar => ({ date, close: 100 });

/** Tutte le sedute di un mese, semplificate a giorni consecutivi. */
function mese(ym: string, giorni = 20): DailyBar[] {
  return Array.from({ length: giorni }, (_, i) =>
    barra(`${ym}-${String(i + 1).padStart(2, "0")}`),
  );
}

describe("mesiSenzaSedute", () => {
  it("una serie continua non ha buchi", () => {
    const bars = [...mese("2024-01"), ...mese("2024-02"), ...mese("2024-03")];
    expect(mesiSenzaSedute(bars)).toEqual([]);
  });

  it("trova il mese mancante in mezzo", () => {
    const bars = [...mese("2024-01"), ...mese("2024-03")];
    expect(mesiSenzaSedute(bars)).toEqual(["2024-02"]);
  });

  it("trova un anno intero, che è il caso vero dell'oro", () => {
    const bars = [...mese("2004-12"), ...mese("2006-01")];
    expect(mesiSenzaSedute(bars)).toHaveLength(12);
    expect(mesiSenzaSedute(bars)[0]).toBe("2005-01");
    expect(mesiSenzaSedute(bars).at(-1)).toBe("2005-12");
  });

  it("attraversa il confine d'anno senza inventare mesi", () => {
    const bars = [...mese("2023-11"), ...mese("2024-02")];
    expect(mesiSenzaSedute(bars)).toEqual(["2023-12", "2024-01"]);
  });

  /* I DUE CASI CHE NON DEVONO SCATTARE. */
  it("un primo mese parziale non è un buco", () => {
    const bars = [barra("2024-01-28"), barra("2024-01-31"), ...mese("2024-02")];
    expect(mesiSenzaSedute(bars)).toEqual([]);
  });

  it("un ultimo mese parziale non è un buco", () => {
    const bars = [...mese("2024-01"), barra("2024-02-01")];
    expect(mesiSenzaSedute(bars)).toEqual([]);
  });

  it("una serie di un mese solo non ha buchi", () => {
    expect(mesiSenzaSedute(mese("2024-05"))).toEqual([]);
  });

  it("una serie vuota non produce un elenco infinito", () => {
    expect(mesiSenzaSedute([])).toEqual([]);
  });

  it("non dipende dall'ordine delle barre", () => {
    const bars = [...mese("2024-03"), ...mese("2024-01")];
    expect(mesiSenzaSedute(bars)).toEqual(["2024-02"]);
  });
});
