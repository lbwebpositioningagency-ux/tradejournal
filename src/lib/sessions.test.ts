import { describe, expect, it } from "vitest";
import {
  fillSessionSeries,
  SESSION_WINDOWS,
  SESSIONS,
} from "./sessions";

describe("sessioni di mercato", () => {
  it("F7: finestre nel fuso dell'exchange, in ordine di priorità NY → Londra → Asia", () => {
    expect(SESSION_WINDOWS.map((w) => w.session)).toEqual([
      "NEWYORK",
      "LONDON",
      "ASIA",
    ]);
    for (const window of SESSION_WINDOWS) {
      expect(window.startMin).toBeGreaterThanOrEqual(0);
      expect(window.endMin).toBeGreaterThan(window.startMin);
      expect(window.endMin).toBeLessThanOrEqual(24 * 60);
      // Fuso IANA reale: Intl deve accettarlo (protegge da refusi).
      expect(() =>
        new Intl.DateTimeFormat("en-US", { timeZone: window.timezone }),
      ).not.toThrow();
    }
    expect(SESSIONS).toEqual(["ASIA", "LONDON", "NEWYORK", "OFF"]);
  });

  it("fillSessionSeries: sempre 4 sessioni nell'ordine canonico, zeri dove mancano", () => {
    const series = fillSessionSeries([
      {
        session: "NEWYORK",
        total: 5,
        wins: 3,
        losses: 2,
        breakevens: 0,
        netPnl: "120.50",
        winSum: "200.00",
        lossSum: "-79.50",
        rSum: "2.5",
        rCount: 4,
      },
    ]);
    expect(series.map((s) => s.session)).toEqual([
      "ASIA",
      "LONDON",
      "NEWYORK",
      "OFF",
    ]);
    expect(series[2]).toMatchObject({
      total: 5,
      wins: 3,
      netPnl: "120.50",
      rSum: "2.5",
      rCount: 4,
    });
    expect(series[0]).toMatchObject({ total: 0, wins: 0, netPnl: "0", rCount: 0 });
  });

  it("righe con chiave sconosciuta vengono ignorate (difensivo)", () => {
    const series = fillSessionSeries([
      {
        session: "BOH",
        total: 9,
        wins: 9,
        losses: 0,
        breakevens: 0,
        netPnl: "1",
        winSum: "1",
        lossSum: "0",
        rSum: "0",
        rCount: 0,
      },
    ]);
    expect(series.every((s) => s.total === 0)).toBe(true);
  });
});
