import { describe, expect, it } from "vitest";
import { mulberry32 } from "./metrics/monte-carlo";
import {
  bestAndWorstBucket,
  fillHourSeries,
  fillRDistribution,
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

describe("bestAndWorstBucket con le serie per trade — fase 4", () => {
  /**
   * `n` trade in centesimi attorno a `media`, sparsi a caso (seme fisso) fra
   * ±`rumore`. Non una serie regolare: a blocchi ogni blocco avrebbe quasi la
   * stessa somma e il bootstrap, correttamente, non vedrebbe dispersione.
   */
  const serie = (n: number, media: number, rumore: number, seme = 7) => {
    const rnd = mulberry32(seme);
    return Array.from({ length: n }, () =>
      String(media + Math.round((rnd() * 2 - 1) * rumore)),
    );
  };

  it("attese distinte e intervalli disgiunti: elezione sull'ATTESA PER TRADE", () => {
    const r = bestAndWorstBucket([
      // Più P&L totale ma meno per trade: col vecchio criterio vinceva "10".
      { label: "10", netPnl: "3000.00", trades: 60, pnlUnits: serie(60, 5000, 100, 1) },
      { label: "11", netPnl: "2000.00", trades: 40, pnlUnits: serie(40, 20000, 100, 2) },
      { label: "12", netPnl: "-1600.00", trades: 40, pnlUnits: serie(40, -4000, 100, 3) },
    ]);
    expect(r.best?.label).toBe("11");
    expect(r.worst?.label).toBe("12");
    expect(r.overlapping).toBeNull();
    expect(Number(r.best?.mean?.value)).toBeCloseTo(200, 0);
  });

  it("intervalli sovrapposti: nessuna elezione, i due candidati restano nominati", () => {
    const r = bestAndWorstBucket([
      // Attese vicine (+30 e 0 USD) con dispersione di ±900 USD: intervalli
      // larghi centinaia di dollari, sovrapposti qualunque sia il seme.
      { label: "16", netPnl: "1860.00", trades: 62, pnlUnits: serie(62, 3000, 90000, 11) },
      { label: "17", netPnl: "0.00", trades: 32, pnlUnits: serie(32, 0, 90000, 12) },
    ]);
    expect(r.best).toBeNull();
    expect(r.overlapping?.high.label).toBe("16");
    expect(r.overlapping?.low.label).toBe("17");
  });

  it("con le serie, sotto 30 trade la fascia non ha stima e non entra", () => {
    const r = bestAndWorstBucket([
      { label: "a", netPnl: "100.00", trades: 12, pnlUnits: serie(12, 900, 10) },
      { label: "b", netPnl: "50.00", trades: 40, pnlUnits: serie(40, 125, 10) },
    ]);
    expect(r.eligible).toBe(1);
    expect(r.best).toBeNull();
  });
});

describe("bestAndWorstBucket — elezione solo da 30 trade", () => {
  it("un'ora con UN trade fortunato non diventa l'ora migliore (regressione)", () => {
    const result = bestAndWorstBucket([
      { label: "09", netPnl: "150.00", trades: 31 },
      { label: "10", netPnl: "0", trades: 0 },
      { label: "15", netPnl: "-80.50", trades: 40 },
      { label: "16", netPnl: "300.00", trades: 1 }, // prima era la «migliore»
    ]);
    expect(result.best?.label).toBe("09");
    expect(result.worst?.label).toBe("15");
    expect(result.eligible).toBe(2);
    expect(result.withTrades).toBe(3);
  });

  it("confronto Decimal, non lessicografico", () => {
    const result = bestAndWorstBucket([
      { label: "a", netPnl: "9.50", trades: 30 },
      { label: "b", netPnl: "100.00", trades: 30 }, // "100" < "9.5" come stringa
    ]);
    expect(result.best?.label).toBe("b");
    expect(result.worst?.label).toBe("a");
  });

  it("sotto soglia o senza trade → nessuna etichetta, ma i gruppi si contano", () => {
    expect(bestAndWorstBucket([{ label: "00", netPnl: "0", trades: 0 }])).toEqual({
      best: null,
      worst: null,
      eligible: 0,
      withTrades: 0,
      overlapping: null,
    });
    const pochi = bestAndWorstBucket([
      { label: "a", netPnl: "500", trades: 4 },
      { label: "b", netPnl: "-200", trades: 2 },
    ]);
    expect(pochi.best).toBeNull();
    expect(pochi.withTrades).toBe(2);
  });
});

describe("fillRDistribution (F32)", () => {
  const BE = -100;

  it("riempie i bin mancanti tra min e max, con BE tra negativi e positivi", () => {
    const points = fillRDistribution(
      [
        { bin: -3, count: 2 },
        { bin: 0, count: 5 },
        { bin: 3, count: 1 },
        { bin: BE, count: 4 },
      ],
      BE,
    );
    // da -3 (min osservato) a 3 (max osservato), BE dopo l'ultimo negativo
    expect(points.map((p) => p.label)).toEqual([
      "-1,5",
      "-1",
      "-0,5",
      "BE",
      "0",
      "0,5",
      "1",
      "1,5",
    ]);
    expect(points.find((p) => p.label === "BE")).toEqual({
      label: "BE",
      range: "breakeven (R = 0)",
      count: 4,
      kind: "be",
    });
    expect(points[0]).toEqual({
      label: "-1,5",
      range: "da -1,5R a -1R",
      count: 2,
      kind: "loss",
    });
    expect(points.find((p) => p.label === "0")?.count).toBe(5);
    // bin vuoto intermedio presente con zero
    expect(points.find((p) => p.label === "1")?.count).toBe(0);
  });

  it("overflow: bin -9 e 8 hanno etichette aperte", () => {
    const points = fillRDistribution(
      [
        { bin: -9, count: 1 },
        { bin: 8, count: 2 },
      ],
      BE,
    );
    expect(points[0].label).toBe("<-4");
    expect(points[0].range).toBe("sotto -4R");
    expect(points.at(-1)?.label).toBe("≥4");
  });

  it("nessun dato: range minimo −1R…+1R con BE a zero", () => {
    const points = fillRDistribution([], BE);
    expect(points.map((p) => p.label)).toEqual(["-1", "-0,5", "BE", "0", "0,5"]);
    expect(points.every((p) => p.count === 0)).toBe(true);
  });
});
