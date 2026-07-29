import { describe, expect, it } from "vitest";
import { breakEvenWinRate, winRateMargin } from "./break-even";
import { kellyFraction, optimalF, OPTIMAL_F_MIN_TRADES } from "./kelly";
import { riskOfRuinAnalytic } from "./risk-of-ruin";
import { concentration } from "./concentration";
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

describe("riskOfRuinAnalytic", () => {
  it("payoff 1: coincide con la rovina del giocatore classica (q/p)^U", () => {
    // p 0,6 · q 0,4 · 10 unità → (2/3)^10 = 0,01734…
    const ruin = riskOfRuinAnalytic({
      winRate: "0.6",
      payoff: "1",
      units: "10",
    });
    expect(Number(ruin)).toBeCloseTo((2 / 3) ** 10, 4);
  });

  it("senza edge la rovina è certa, e va detto", () => {
    expect(
      riskOfRuinAnalytic({ winRate: "0.5", payoff: "1", units: "50" }),
    ).toBe("1");
    expect(
      riskOfRuinAnalytic({ winRate: "0.3", payoff: "2", units: "50" }),
    ).toBe("1");
  });

  it("più capitale (in unità di perdita) = meno rischio", () => {
    const poco = riskOfRuinAnalytic({ winRate: "0.55", payoff: "1.5", units: "5" })!;
    const tanto = riskOfRuinAnalytic({ winRate: "0.55", payoff: "1.5", units: "40" })!;
    expect(Number(tanto)).toBeLessThan(Number(poco));
    expect(Number(poco)).toBeLessThanOrEqual(1);
  });

  it("una probabilità minuscola sopravvive: non si arrotonda a zero", () => {
    // Conto grande rispetto al rischio per trade: il risultato è ~1e-33 e
    // deve restare distinguibile da uno zero esatto.
    const ruin = riskOfRuinAnalytic({
      winRate: "0.55",
      payoff: "1.5",
      units: "180",
    })!;
    expect(Number(ruin)).toBeGreaterThan(0);
    expect(Number(ruin)).toBeLessThan(0.0001);
  });

  it("input fuori dominio → non calcolabile", () => {
    expect(riskOfRuinAnalytic({ winRate: "1", payoff: "2", units: "10" })).toBeNull();
    expect(riskOfRuinAnalytic({ winRate: "0.5", payoff: "0", units: "10" })).toBeNull();
    expect(riskOfRuinAnalytic({ winRate: "0.5", payoff: "2", units: "0" })).toBeNull();
  });
});

describe("concentration", () => {
  const base = {
    top1: "500",
    top3: "900",
    top5: "1100",
    top10: "1400",
    topDecile: "900",
    grossProfit: "2000",
    winners: 30,
    netPnl: "800",
  };

  it("quote sul profitto LORDO e netto senza quei trade", () => {
    const result = concentration(base);
    const top3 = result.slices.find((s) => s.label === "Top 3")!;
    expect(top3.share).toBe("0.4500");
    expect(top3.netWithout).toBe("-100.00");
    // Togliendo i 3 migliori il periodo va in perdita: è il segnale.
    expect(top3.flipsToLoss).toBe(true);
  });

  it("il miglior trade da solo non ribalta il risultato, e si vede", () => {
    const best = concentration(base).slices[0];
    expect(best.share).toBe("0.2500");
    expect(best.netWithout).toBe("300.00");
    expect(best.flipsToLoss).toBe(false);
  });

  it("nessuna fascia più grande del numero di vincenti", () => {
    // 4 vincenti: "Top 5" e "Top 10" sarebbero lo stesso gruppo con un'altra
    // etichetta, e il decile (1 trade) coincide col miglior trade.
    const result = concentration({ ...base, winners: 4 });
    expect(result.slices.map((s) => s.label)).toEqual([
      "Miglior trade",
      "Top 3",
    ]);
  });

  it("il decile non si ripete se coincide con una fascia fissa", () => {
    // 96 vincenti → decile = 10 trade, cioè esattamente "Top 10".
    const labels = concentration({ ...base, winners: 96 }).slices.map(
      (s) => s.label,
    );
    expect(labels).toEqual(["Miglior trade", "Top 3", "Top 5", "Top 10"]);
  });

  it("il decile compare quando è un gruppo diverso", () => {
    // 200 vincenti → decile = 20 trade: una fascia in più, non un doppione.
    const labels = concentration({ ...base, winners: 200 }).slices.map(
      (s) => s.label,
    );
    expect(labels).toContain("Top 10% (20)");
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
