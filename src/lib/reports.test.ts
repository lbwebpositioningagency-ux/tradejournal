import { describe, expect, it } from "vitest";
import {
  bestAndWorstBucket,
  fillHourSeries,
  fillWeekdaySeries,
} from "./reports";

describe("fillHourSeries", () => {
  it("riempie le 24 ore, con zeri dove non ci sono trade", () => {
    const series = fillHourSeries([
      { hour: 9, netPnl: "150.00", total: 3 },
      { hour: 15, netPnl: "-80.50", total: 2 },
    ]);
    expect(series).toHaveLength(24);
    expect(series[9]).toEqual({ label: "09", netPnl: "150.00", trades: 3 });
    expect(series[15]).toEqual({ label: "15", netPnl: "-80.50", trades: 2 });
    expect(series[0]).toEqual({ label: "00", netPnl: "0", trades: 0 });
    expect(series[23].label).toBe("23");
  });

  it("serie vuota → 24 zeri", () => {
    const series = fillHourSeries([]);
    expect(series).toHaveLength(24);
    expect(series.every((p) => p.trades === 0 && p.netPnl === "0")).toBe(true);
  });
});

describe("fillWeekdaySeries", () => {
  it("ordina lun→dom con le etichette italiane (ISO 1-7)", () => {
    const series = fillWeekdaySeries([
      { weekday: 1, netPnl: "100.00", total: 4 },
      { weekday: 7, netPnl: "-50.00", total: 1 },
    ]);
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ label: "Lun", netPnl: "100.00", trades: 4 });
    expect(series[6]).toEqual({ label: "Dom", netPnl: "-50.00", trades: 1 });
    expect(series[2]).toEqual({ label: "Mer", netPnl: "0", trades: 0 });
  });
});

describe("bestAndWorstBucket", () => {
  it("trova migliore e peggiore SOLO tra i bucket con trade", () => {
    const result = bestAndWorstBucket([
      { label: "09", netPnl: "150.00", trades: 3 },
      { label: "10", netPnl: "0", trades: 0 }, // vuoto: ignorato anche se 0 > -80
      { label: "15", netPnl: "-80.50", trades: 2 },
      { label: "16", netPnl: "300.00", trades: 1 },
    ]);
    expect(result?.best.label).toBe("16");
    expect(result?.worst.label).toBe("15");
  });

  it("confronto Decimal, non lessicografico", () => {
    const result = bestAndWorstBucket([
      { label: "a", netPnl: "9.50", trades: 1 },
      { label: "b", netPnl: "100.00", trades: 1 }, // "100" < "9.5" come stringa
    ]);
    expect(result?.best.label).toBe("b");
    expect(result?.worst.label).toBe("a");
  });

  it("nessun bucket con trade → null", () => {
    expect(
      bestAndWorstBucket([{ label: "00", netPnl: "0", trades: 0 }]),
    ).toBeNull();
    expect(bestAndWorstBucket([])).toBeNull();
  });
});
