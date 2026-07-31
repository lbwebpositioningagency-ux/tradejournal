import { describe, expect, it } from "vitest";
import { fillWeekdaySeries, WEEKDAY_LABELS } from "./weekdays";
import type { WeekdayBreakdownRow } from "./queries/reports";

function row(weekday: number, over: Partial<WeekdayBreakdownRow> = {}): WeekdayBreakdownRow {
  return {
    weekday,
    total: 3,
    wins: 2,
    losses: 1,
    breakevens: 0,
    netPnl: "100.00",
    winSum: "150.00",
    lossSum: "-50.00",
    rSum: "1.5000",
    rCount: 3,
    ...over,
  };
}

describe("fillWeekdaySeries", () => {
  it("sempre lun-ven nell'ordine ISO, zeri dove mancano", () => {
    const series = fillWeekdaySeries([row(2), row(4)]);
    expect(series.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(series.map((p) => p.label)).toEqual([
      "Lunedì",
      "Martedì",
      "Mercoledì",
      "Giovedì",
      "Venerdì",
    ]);
    expect(series[0].total).toBe(0);
    expect(series[0].netPnl).toBe("0");
    expect(series[1].total).toBe(3);
    expect(series[1].netPnl).toBe("100.00");
  });

  it("weekend escluso quando senza trade", () => {
    const series = fillWeekdaySeries([row(1), row(5)]);
    expect(series.some((p) => p.weekday >= 6)).toBe(false);
  });

  it("sabato/domenica esclusi ANCHE con trade nello scope (caso SIM1)", () => {
    // Il conto demo SIM1 ha 7 trade di sabato nel seed: contano in tutte le
    // altre metriche del conto, ma qui non devono produrre una riga.
    const conSabato = fillWeekdaySeries([row(6, { total: 7 })]);
    expect(conSabato.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(conSabato).toHaveLength(5);
    expect(conSabato.some((p) => /Sabato|Domenica/.test(p.label))).toBe(false);

    const conDomenica = fillWeekdaySeries([row(7, { total: 1 })]);
    expect(conDomenica.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5]);

    // Nemmeno mescolati ai feriali, e il P&L del weekend non finisce
    // spalmato su un altro giorno: i feriali restano quelli che sono.
    const misto = fillWeekdaySeries([
      row(3, { total: 4, netPnl: "220.00" }),
      row(6, { total: 7, netPnl: "999.00" }),
      row(7, { total: 2, netPnl: "-40.00" }),
    ]);
    expect(misto).toHaveLength(5);
    expect(misto.map((p) => p.netPnl)).toEqual(["0", "0", "220.00", "0", "0"]);
    expect(misto.reduce((n, p) => n + p.total, 0)).toBe(4);
  });

  it("nessuna etichetta per sabato e domenica", () => {
    // Se qualcuno rimette le chiavi 6/7 sta cambiando la decisione, non
    // sistemando un dettaglio: il test lo dichiara.
    expect(WEEKDAY_LABELS[6]).toBeUndefined();
    expect(WEEKDAY_LABELS[7]).toBeUndefined();
    expect(Object.keys(WEEKDAY_LABELS)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("zero righe: settimana operativa vuota, mai il weekend", () => {
    const series = fillWeekdaySeries([]);
    expect(series).toHaveLength(5);
    expect(series.every((p) => p.total === 0)).toBe(true);
  });

  it("riga weekend con total 0 (difensivo): non compare", () => {
    const series = fillWeekdaySeries([row(6, { total: 0 })]);
    expect(series).toHaveLength(5);
  });
});
