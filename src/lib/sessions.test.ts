import { describe, expect, it } from "vitest";
import {
  fillSessionSeries,
  SESSION_TIMEZONE,
  SESSION_WINDOWS,
  SESSIONS,
} from "./sessions";

describe("sessioni di mercato", () => {
  it("Fase 35: fasce contigue in ora italiana — Asia 00-08, Londra 08-14, NY 14-22, OFF 22-24", () => {
    expect(SESSION_WINDOWS).toEqual([
      { session: "ASIA", startMin: 0, endMin: 480 },
      { session: "LONDON", startMin: 480, endMin: 840 },
      { session: "NEWYORK", startMin: 840, endMin: 1320 },
    ]);
    // Partizione: ogni fascia inizia dove finisce la precedente, e il
    // residuo 22:00-24:00 è la categoria OFF (mai accorpata alle tre).
    for (let i = 1; i < SESSION_WINDOWS.length; i++) {
      expect(SESSION_WINDOWS[i].startMin).toBe(SESSION_WINDOWS[i - 1].endMin);
    }
    expect(SESSION_WINDOWS.at(-1)!.endMin).toBeLessThan(24 * 60);
    // Fuso IANA reale (mai offset fisso): Intl deve accettarlo.
    expect(SESSION_TIMEZONE).toBe("Europe/Rome");
    expect(() =>
      new Intl.DateTimeFormat("en-US", { timeZone: SESSION_TIMEZONE }),
    ).not.toThrow();
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
        rWinSum: "4.5",
        rWinCount: 3,
        rLossSum: "-2.0",
        rLossCount: 1,
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
        rWinSum: "0",
        rWinCount: 0,
        rLossSum: "0",
        rLossCount: 0,
      },
    ]);
    expect(series.every((s) => s.total === 0)).toBe(true);
  });
});
