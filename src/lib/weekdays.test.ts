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

  it("sabato/domenica compaiono SOLO se contengono trade", () => {
    const series = fillWeekdaySeries([row(6, { total: 7 })]);
    expect(series.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(series.at(-1)?.label).toBe(WEEKDAY_LABELS[6]);
    expect(series.at(-1)?.total).toBe(7);

    const conDomenica = fillWeekdaySeries([row(7, { total: 1 })]);
    expect(conDomenica.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5, 7]);
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
