import { describe, expect, it } from "vitest";
import { underwaterSeries } from "./underwater";

describe("underwaterSeries (W4)", () => {
  it("drawdown dal picco, zero sui nuovi massimi", () => {
    const points = underwaterSeries(
      [
        { day: "2026-07-01", netPnl: "1000" }, // 11000: nuovo picco → 0
        { day: "2026-07-02", netPnl: "-2200" }, // 8800: -20% dal picco
        { day: "2026-07-03", netPnl: "1100" }, // 9900: -10%
        { day: "2026-07-04", netPnl: "1200" }, // 11100: nuovo picco → 0
      ],
      "10000",
    );
    expect(points.map((p) => p.ddPct)).toEqual(["0", "-0.2", "-0.1", "0"]);
  });

  it("il picco include il saldo iniziale (partenza in perdita)", () => {
    const points = underwaterSeries(
      [{ day: "2026-07-01", netPnl: "-500" }],
      "10000",
    );
    expect(points[0].ddPct).toBe("-0.05");
  });

  it("equity oltre il -100% del picco: clamp a -1", () => {
    const points = underwaterSeries(
      [{ day: "2026-07-01", netPnl: "-15000" }],
      "10000",
    );
    expect(points[0].ddPct).toBe("-1");
  });

  it("serie vuota → nessun punto", () => {
    expect(underwaterSeries([], "10000")).toEqual([]);
  });
});
