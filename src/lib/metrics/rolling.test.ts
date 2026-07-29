import { describe, expect, it } from "vitest";
import {
  dailyReturns,
  rollingRatios,
  rollingTradePoints,
  seriesRange,
  TRADING_DAYS_PER_YEAR,
  type DailyReturn,
} from "./rolling";

/**
 * §2 — rolling metrics. Le proprietà che questi test tengono ferme sono le
 * decisioni prese, non l'implementazione: riempimento dei soli giorni
 * feriali, ritorni sull'equity a INIZIO giornata, annualizzazione ×√252,
 * finestre solo piene, null invece di numeri finti.
 */

/** Serie di ritorni sintetica: valori già pronti, senza passare dai P&L. */
function returns(values: (string | null)[]): DailyReturn[] {
  return values.map((ret, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    netPnl: "0",
    equityStart: "10000.00",
    ret,
  }));
}

describe("dailyReturns", () => {
  it("riempie i giorni feriali senza trade con ritorno 0", () => {
    // 2026-01-05 è lunedì, 2026-01-09 venerdì: cinque sedute consecutive.
    const series = dailyReturns(
      [
        { day: "2026-01-05", netPnl: "100" },
        { day: "2026-01-09", netPnl: "-50" },
      ],
      "10000",
    );

    expect(series).toHaveLength(5);
    expect(series.map((d) => d.day)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
    expect(series[1].netPnl).toBe("0");
    expect(series[1].ret).toBe("0.00000000");
  });

  it("salta sabato e domenica senza trade", () => {
    const series = dailyReturns(
      [
        { day: "2026-01-09", netPnl: "10" },
        { day: "2026-01-12", netPnl: "10" },
      ],
      "10000",
    );
    // Venerdì e lunedì: il fine settimana in mezzo non esiste come seduta.
    expect(series.map((d) => d.day)).toEqual(["2026-01-09", "2026-01-12"]);
  });

  it("NON scarta un fine settimana con P&L reale", () => {
    const series = dailyReturns(
      [
        { day: "2026-01-09", netPnl: "10" },
        { day: "2026-01-10", netPnl: "40" }, // sabato operativo (crypto)
        { day: "2026-01-12", netPnl: "10" },
      ],
      "10000",
    );
    expect(series.map((d) => d.day)).toEqual([
      "2026-01-09",
      "2026-01-10",
      "2026-01-12",
    ]);
    expect(series[1].netPnl).toBe("40");
  });

  it("usa l'equity a INIZIO giornata come denominatore, e la fa scorrere", () => {
    const series = dailyReturns(
      [
        { day: "2026-01-05", netPnl: "100" },
        { day: "2026-01-06", netPnl: "-50" },
      ],
      "10000",
    );

    expect(series[0].equityStart).toBe("10000.00");
    expect(series[0].ret).toBe("0.01000000");
    // Il secondo giorno parte da 10.100, non dai 10.000 iniziali.
    expect(series[1].equityStart).toBe("10100.00");
    expect(series[1].ret).toBe("-0.00495050");
  });

  it("ritorno non definito (null) quando l'equity a inizio giornata è ≤ 0", () => {
    const series = dailyReturns(
      [
        { day: "2026-01-05", netPnl: "-1000" },
        { day: "2026-01-06", netPnl: "50" },
      ],
      "1000",
    );
    expect(series[0].ret).toBe("-1.00000000");
    // Conto azzerato: il rapporto non è una misura, è una divisione per zero.
    expect(series[1].equityStart).toBe("0.00");
    expect(series[1].ret).toBeNull();
  });

  it("serie vuota senza giornate", () => {
    expect(dailyReturns([], "10000")).toEqual([]);
  });
});

describe("rollingRatios", () => {
  it("nessun punto se la serie è più corta della finestra", () => {
    expect(rollingRatios(returns(["0.01", "0.02"]), 3)).toEqual([]);
  });

  it("restituisce solo finestre PIENE", () => {
    const points = rollingRatios(returns(["0.01", "0.02", "0.03", "0.04"]), 3);
    expect(points).toHaveLength(2);
    expect(points[0].day).toBe("2026-01-03");
  });

  it("Sharpe annualizzato su valore noto", () => {
    // media 0,015 · σ(pop) 0,005 · 3 × √252 = 47,6235
    const points = rollingRatios(returns(["0.01", "0.02"]), 2);
    expect(points[0].sharpe).toBe("47.6235");
    // Nessun ritorno sotto il MAR: la downside deviation è zero.
    expect(points[0].sortino).toBeNull();
  });

  it("il risk-free annuale entra scalato a giornaliero (rf/252)", () => {
    // rf 25,2% annuo = 0,1% al giorno → (0,015 − 0,001)/0,005 × √252
    const points = rollingRatios(returns(["0.01", "0.02"]), 2, {
      riskFree: "0.252",
    });
    expect(points[0].sharpe).toBe("44.4486");
  });

  it("Sortino usa la sola deviazione negativa e supera lo Sharpe", () => {
    const points = rollingRatios(returns(["-0.01", "0.03"]), 2);
    // media 0,01 · σ 0,02 → Sharpe 0,5 × √252 = 7,9373
    expect(points[0].sharpe).toBe("7.9373");
    // downside = √(0,01²/2) = 0,00707… → 1,4142 × √252 = 22,4499
    expect(points[0].sortino).toBe("22.4499");
  });

  it("deviazione nulla → rapporto non definito, mai 0", () => {
    const points = rollingRatios(returns(["0.01", "0.01", "0.01"]), 3);
    expect(points[0].sharpe).toBeNull();
    expect(points[0].sortino).toBeNull();
  });

  it("una finestra che contiene un ritorno non definito resta non definita", () => {
    const points = rollingRatios(returns(["0.01", null, "0.02", "0.03"]), 2);
    expect(points[0].sharpe).toBeNull(); // finestra [0.01, null]
    expect(points[1].sharpe).toBeNull(); // finestra [null, 0.02]
    expect(points[2].sharpe).not.toBeNull(); // finestra [0.02, 0.03]
  });

  it("annualizza con la costante dichiarata (√252)", () => {
    expect(TRADING_DAYS_PER_YEAR).toBe(252);
    const points = rollingRatios(returns(["0.01", "0.02"]), 2);
    const daily = 3; // (media − 0) / σ
    expect(Number(points[0].sharpe)).toBeCloseTo(daily * Math.sqrt(252), 4);
  });
});

describe("seriesRange", () => {
  it("min, max, mediana e posizione del valore corrente", () => {
    const range = seriesRange(["1", "3", "2"]);
    expect(range.min).toBe("1");
    expect(range.max).toBe("3");
    expect(range.median).toBe("2");
    expect(range.current).toBe("2");
    expect(range.position).toBe("0.5000");
    expect(range.count).toBe(3);
  });

  it("la mediana ha una posizione propria: non sta al centro per definizione", () => {
    // Distribuzione asimmetrica: mediana 2 su un range 1-10 → 11% del range.
    const range = seriesRange(["1", "2", "2", "2", "10"]);
    expect(range.median).toBe("2");
    expect(range.medianPosition).toBe("0.1111");
    expect(range.position).toBe("1.0000"); // il corrente è il massimo storico
  });

  it("mediana su campione pari = media dei due centrali", () => {
    expect(seriesRange(["1", "2", "3", "4"]).median).toBe("2.5000");
  });

  it("ignora i punti non definiti ma tiene il corrente com'è", () => {
    const range = seriesRange(["1", null, "3", null]);
    expect(range.count).toBe(2);
    // L'ultima finestra non è calcolabile: il "valore corrente" non esiste.
    expect(range.current).toBeNull();
    expect(range.position).toBeNull();
  });

  it("range degenere: nessuna posizione da mostrare", () => {
    const range = seriesRange(["2", "2", "2"]);
    expect(range.min).toBe("2");
    expect(range.max).toBe("2");
    expect(range.position).toBeNull();
    expect(range.medianPosition).toBeNull();
  });

  it("serie tutta non definita", () => {
    expect(seriesRange([null, null])).toMatchObject({
      current: null,
      min: null,
      max: null,
      median: null,
      count: 0,
      position: null,
      medianPosition: null,
    });
  });
});

describe("rollingTradePoints", () => {
  it("deriva le metriche dagli aggregati di finestra, senza formule nuove", () => {
    const points = rollingTradePoints([
      {
        idx: 30,
        day: "2026-01-30",
        total: 30,
        wins: 15,
        losses: 12,
        breakevens: 3,
        netPnl: "600",
        winSum: "1800",
        lossSum: "-1200",
        rSum: "9",
        rCount: 30,
      },
    ]);

    expect(points[0].idx).toBe(30);
    expect(points[0].winRate).toBe("0.5000");
    expect(points[0].profitFactor).toBe("1.5000");
    expect(points[0].expectancy).toBe("20.00");
    expect(points[0].avgR).toBe("0.3000");
    // 30 trade non sono un campione ridotto: la soglia è 5.
    expect(points[0].smallSample).toBe(false);
  });
});
