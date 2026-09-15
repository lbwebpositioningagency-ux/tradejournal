import { describe, expect, it } from "vitest";
import { breakEvenWinRate, winRateMargin } from "./break-even";
import { kellyFraction, optimalF, OPTIMAL_F_MIN_TRADES } from "./kelly";
import { concentration, tradesForPercent } from "./concentration";
import { equityLinearFit } from "./equity-fit";
import { expectedLongestRun, streakDistribution } from "./streak-distribution";

/**
 * §3 — metriche pro. Ogni formula ha almeno un valore NOTO verificabile a
 * mano, più i casi degeneri che nel progetto non devono mai produrre uno
 * zero travestito da risultato.
 */

describe("breakEvenWinRate", () => {
  it("payoff 1 → serve il 50%", () => {
    expect(breakEvenWinRate("1")).toBe("0.5000");
  });

  it("payoff 3 → basta il 25%", () => {
    expect(breakEvenWinRate("3")).toBe("0.2500");
  });

  it("payoff 0,5 → non basta nemmeno il 66%", () => {
    expect(breakEvenWinRate("0.5")).toBe("0.6667");
  });

  it("payoff assente o non positivo → non calcolabile", () => {
    expect(breakEvenWinRate(null)).toBeNull();
    expect(breakEvenWinRate("0")).toBeNull();
    expect(breakEvenWinRate("-2")).toBeNull();
  });

  it("Q-09 — quota BE nel denominatore: con B=10% e payoff 1 la soglia è 45%, non 50%", () => {
    expect(breakEvenWinRate("1", "0.1")).toBe("0.4500");
    // Verifica algebrica: W=0.45, B=0.1 → L=0.45; 0.45·AvgWin = 0.45·AvgLoss
    // con payoff 1: pareggio esatto.
    expect(breakEvenWinRate("3", "0.2")).toBe("0.2000"); // (1−0.2)/4
    // Quota zero o assente: identica al modello a due esiti.
    expect(breakEvenWinRate("1", "0")).toBe("0.5000");
    expect(breakEvenWinRate("1", null)).toBe("0.5000");
  });

  it("Q-09 — quota BE degenere (tutti breakeven o negativa) → null", () => {
    expect(breakEvenWinRate("1", "1")).toBeNull();
    expect(breakEvenWinRate("1", "-0.1")).toBeNull();
  });

  it("il margine è la distanza dalla soglia, col segno", () => {
    expect(winRateMargin("0.55", "0.5000")).toBe("0.0500");
    expect(winRateMargin("0.40", "0.5000")).toBe("-0.1000");
    expect(winRateMargin(null, "0.5000")).toBeNull();
  });
});

describe("kellyFraction", () => {
  it("valore noto: W 60%, payoff 1 → 20% del capitale", () => {
    expect(kellyFraction("0.6", "1")).toBe("0.2000");
  });

  it("valore noto: W 40%, payoff 3 → 20%", () => {
    // 0,4 − 0,6/3 = 0,2
    expect(kellyFraction("0.4", "3")).toBe("0.2000");
  });

  it("nessun edge → 0, mai una frazione negativa", () => {
    expect(kellyFraction("0.4", "1")).toBe("0.0000");
  });

  it("dati mancanti → null", () => {
    expect(kellyFraction(null, "2")).toBeNull();
    expect(kellyFraction("0.5", null)).toBeNull();
    expect(kellyFraction("0.5", "0")).toBeNull();
  });
});

describe("optimalF", () => {
  const repeat = (values: string[], times: number) =>
    Array.from({ length: times }, () => values).flat();

  it("sotto il campione minimo non si pronuncia", () => {
    expect(optimalF(repeat(["1", "-1"], 10))).toBeNull();
    expect(OPTIMAL_F_MIN_TRADES).toBe(30);
  });

  it("serie in perdita: la frazione migliore è la più piccola", () => {
    const result = optimalF(repeat(["-1", "-1", "1"], 15))!;
    expect(result.f).toBe("0.0100");
    // Crescita comunque sotto 1: non c'è f che salvi un sistema perdente.
    expect(Number(result.growth)).toBeLessThan(1);
  });

  it("edge positivo: f interna e crescita sopra 1", () => {
    // 60% di +1R, 40% di −1R → Kelly binario direbbe 0,20.
    const result = optimalF(repeat(["1", "1", "1", "-1", "-1"], 12))!;
    expect(Number(result.f)).toBeGreaterThan(0.1);
    expect(Number(result.f)).toBeLessThan(0.35);
    expect(Number(result.growth)).toBeGreaterThan(1);
  });

  it("non propone una f che azzera il conto sul campione", () => {
    // Un −2R nel campione: a f = 0,5 il fattore è 0 → esclusa.
    const result = optimalF(repeat(["3", "-2", "1"], 12))!;
    expect(Number(result.f)).toBeLessThan(0.5);
  });
});

describe("concentration", () => {
  // 100 vincenti: 1% → 1 trade, 5% → 5, 10% → 10, 25% → 25, tutti interi.
  const base = {
    top1Pct: "500",
    top5Pct: "900",
    top10Pct: "1100",
    top25Pct: "1400",
    grossProfit: "2000",
    winners: 100,
    netPnl: "800",
  };
  const labels = (input: typeof base) =>
    concentration(input).slices.map((s) => s.label);

  it("quattro righe, tutte percentuali, col numero di trade accanto", () => {
    expect(labels(base)).toEqual([
      "Top 1% (1)",
      "Top 5% (5)",
      "Top 10% (10)",
      "Top 25% (25)",
    ]);
    expect(concentration(base).rounding).toBeNull();
  });

  it("quote sul profitto LORDO e netto senza quei trade", () => {
    const top5 = concentration(base).slices[1];
    expect(top5.share).toBe("0.4500");
    expect(top5.netWithout).toBe("-100.00");
    // Togliendo il 5% migliore il periodo va in perdita: è il segnale.
    expect(top5.flipsToLoss).toBe(true);
  });

  it("l'1% da solo non ribalta il risultato, e si vede", () => {
    const top1 = concentration(base).slices[0];
    expect(top1.share).toBe("0.2500");
    expect(top1.netWithout).toBe("300.00");
    expect(top1.flipsToLoss).toBe(false);
  });

  it("arrotonda per eccesso e dichiara il primo caso non intero", () => {
    // 31 vincenti: 0,31 → 1 · 1,55 → 2 · 3,1 → 4 · 7,75 → 8.
    const result = concentration({ ...base, winners: 31 });
    expect(result.slices.map((s) => s.trades)).toEqual([1, 2, 4, 8]);
    expect(result.rounding).toEqual({ percent: 1, exact: "0.31", trades: 1 });
  });

  it("niente errore di virgola mobile: il 7% di 100 è 7, non 8", () => {
    // In virgola mobile 100 × 0,07 fa 7,000000000000001 e l'eccesso darebbe 8.
    expect(tradesForPercent(100, 7)).toBe(7);
    expect(tradesForPercent(30, 10)).toBe(3);
    expect(tradesForPercent(700, 1)).toBe(7);
  });

  it("ogni soglia contiene almeno un trade, e nessuno senza vincenti", () => {
    expect(tradesForPercent(1, 1)).toBe(1);
    expect(tradesForPercent(0, 25)).toBe(0);
  });

  it("le soglie che danno lo stesso gruppo stanno su una riga sola", () => {
    // 12 vincenti: 1% e 5% sono entrambe 1 trade; 10% → 2; 25% → 3.
    const result = concentration({ ...base, winners: 12 });
    expect(result.slices.map((s) => s.label)).toEqual([
      "Top 1% · 5% (1)",
      "Top 10% (2)",
      "Top 25% (3)",
    ]);
    expect(result.slices[0].percents).toEqual([1, 5]);
    // La riga unita porta la somma del gruppo, non una media delle soglie.
    expect(result.slices[0].share).toBe("0.2500");
  });

  it("con 3 vincenti tutte le soglie sono il miglior trade: una riga", () => {
    expect(labels({ ...base, winners: 3 })).toEqual(["Top 1% · 5% · 10% · 25% (1)"]);
  });

  it("nessun vincente: nessuna riga", () => {
    const result = concentration({
      ...base,
      winners: 0,
      top1Pct: null,
      top5Pct: null,
      top10Pct: null,
      top25Pct: null,
    });
    expect(result.slices).toEqual([]);
    expect(result.rounding).toBeNull();
  });

  it("profitto lordo zero: nessuna quota inventata", () => {
    const result = concentration({ ...base, grossProfit: "0" });
    expect(result.slices.every((s) => s.share === null)).toBe(true);
  });
});

describe("equityLinearFit", () => {
  it("crescita perfettamente lineare → R² 1 e pendenza esatta", () => {
    const fit = equityLinearFit(["100", "200", "300", "400"]);
    expect(fit.r2).toBe("1.0000");
    expect(fit.slope).toBe("100.00");
  });

  it("discesa regolare: R² alto ma pendenza NEGATIVA (si leggono insieme)", () => {
    const fit = equityLinearFit(["400", "300", "200", "100"]);
    expect(fit.r2).toBe("1.0000");
    expect(Number(fit.slope)).toBeLessThan(0);
  });

  it("risultato concentrato in un salto → R² più basso", () => {
    const fit = equityLinearFit(["100", "100", "100", "500", "500", "500"]);
    expect(Number(fit.r2)).toBeLessThan(0.8);
  });

  it("meno di 3 punti: la retta passerebbe esatta per costruzione", () => {
    expect(equityLinearFit(["100", "200"]).r2).toBeNull();
  });

  it("equity piatta: nessuna varianza da spiegare", () => {
    expect(equityLinearFit(["100", "100", "100"]).r2).toBeNull();
  });
});

describe("streakDistribution", () => {
  const runs = [
    { outcome: "WIN" as const, length: 1, count: 12 },
    { outcome: "WIN" as const, length: 3, count: 2 },
    { outcome: "LOSS" as const, length: 1, count: 10 },
    { outcome: "LOSS" as const, length: 2, count: 4 },
  ];

  it("riempie le lunghezze intermedie mancanti", () => {
    const dist = streakDistribution(runs);
    expect(dist.bars.map((b) => b.length)).toEqual([1, 2, 3]);
    // Da questo trader una serie di 2 vincite non capita mai: barra a zero.
    expect(dist.bars[1].wins).toBe(0);
    expect(dist.bars[1].losses).toBe(4);
  });

  it("serie più lunghe e conteggi per direzione", () => {
    const dist = streakDistribution(runs);
    expect(dist.longestWin).toBe(3);
    expect(dist.longestLoss).toBe(2);
    expect(dist.winRuns).toBe(14);
    expect(dist.lossRuns).toBe(14);
  });

  it("nessuna serie: struttura vuota, non barre finte", () => {
    expect(streakDistribution([]).bars).toEqual([]);
  });
});

describe("expectedLongestRun", () => {
  it("valore noto: 100 trade, 50% di perdite → ~5,6 consecutive", () => {
    // ln(100 × 0,5) / ln(2) = 3,912/0,693 = 5,64
    expect(expectedLongestRun(100, "0.5")).toBe("5.6");
  });

  it("più trade = serie peggiore più lunga, senza che nulla sia cambiato", () => {
    const cento = Number(expectedLongestRun(100, "0.55"));
    const mille = Number(expectedLongestRun(1000, "0.55"));
    expect(mille).toBeGreaterThan(cento);
  });

  it("probabilità fuori da (0,1) o nessun trade → non definita", () => {
    expect(expectedLongestRun(100, "0")).toBeNull();
    expect(expectedLongestRun(100, "1")).toBeNull();
    expect(expectedLongestRun(0, "0.5")).toBeNull();
  });
});
