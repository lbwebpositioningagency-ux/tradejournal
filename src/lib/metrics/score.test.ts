import { describe, expect, it } from "vitest";
import { maxDrawdown, radarScore, SCORE_MIN_TRADES } from "./index";
import type { RadarScoreInput } from "./index";

/**
 * Test della formula a 6 fattori (peso uguale 100/6) e delle
 * normalizzazioni di ciascun fattore — casi noti: tutti vincenti, tutti
 * perdenti, storico misto, storico vuoto, un solo trade.
 */

const base: RadarScoreInput = {
  total: 100,
  wins: 55,
  losses: 45,
  winSum: "9000.00",
  lossSum: "-4500.00",
  netPnl: "4500.00",
  maxDrawdown: "500.00",
  maxDrawdownPct: "0.0500",
  daily: [
    { netPnl: "1500.00" },
    { netPnl: "1500.00" },
    { netPnl: "2000.00" },
    { netPnl: "-500.00" },
  ],
};

describe("radarScore — normalizzazione dei singoli fattori", () => {
  it("storico misto: ogni fattore segue la sua scala documentata", () => {
    const result = radarScore(base)!;
    // Win %: 55% / 60% = 91.67
    expect(result.factors.winRate).toBeCloseTo(91.67, 2);
    // PF: 9000/4500 = 2 → 2/2.5 = 80
    expect(result.factors.profitFactor).toBe(80);
    // Payoff: avgWin 163.64 / avgLoss 100 = 1.6364 → /2 = 81.82
    expect(result.factors.avgWinLoss).toBeCloseTo(81.82, 2);
    // Recovery: 4500/500 = 9 → /3 = 3 → clamp 100
    expect(result.factors.recoveryFactor).toBe(100);
    // Max DD: 1 − 0.05/0.20 = 75
    expect(result.factors.maxDrawdown).toBe(75);
    // Consistency: miglior giornata 2000 / positive 5000 = 0.4 → 60
    expect(result.factors.consistency).toBe(60);
  });

  it("lo score è la media a peso uguale dei 6 fattori, due decimali", () => {
    const result = radarScore(base)!;
    const mean =
      (91.666666 + 80 + 81.818181 + 100 + 75 + 60) / 6;
    expect(Number(result.score)).toBeCloseTo(mean, 1);
    expect(result.score).toMatch(/^\d+\.\d{2}$/);
    expect(result.lowSample).toBe(false);
  });

  it("tutti trade vincenti: PF e payoff senza perdite valgono 100", () => {
    const result = radarScore({
      total: 40,
      wins: 40,
      losses: 0,
      winSum: "4000.00",
      lossSum: "0.00",
      netPnl: "4000.00",
      maxDrawdown: "0.00",
      maxDrawdownPct: "0.0000",
      daily: [
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
      ],
    })!;
    expect(result.factors.profitFactor).toBe(100);
    expect(result.factors.avgWinLoss).toBe(100);
    expect(result.factors.recoveryFactor).toBe(100); // zero DD con profitto
    expect(result.factors.maxDrawdown).toBe(100);
    expect(result.factors.winRate).toBe(100); // 100% > tetto 60%
    // Consistency: 1000/4000 → 1−0.25 = 75; score = (5·100+75)/6
    expect(result.factors.consistency).toBe(75);
    expect(result.score).toBe("95.83");
  });

  it("tutti trade perdenti: tutto a zero tranne il fattore drawdown", () => {
    const result = radarScore({
      total: 30,
      wins: 0,
      losses: 30,
      winSum: "0.00",
      lossSum: "-3000.00",
      netPnl: "-3000.00",
      maxDrawdown: "3000.00",
      maxDrawdownPct: "0.3000",
      daily: [{ netPnl: "-1500.00" }, { netPnl: "-1500.00" }],
    })!;
    expect(result.factors.winRate).toBe(0);
    expect(result.factors.profitFactor).toBe(0); // solo breakeven/nessuna vincita
    expect(result.factors.avgWinLoss).toBe(0);
    expect(result.factors.recoveryFactor).toBe(0); // netto negativo
    expect(result.factors.maxDrawdown).toBe(0); // 30% ≥ tetto 20% → clamp 0
    expect(result.factors.consistency).toBe(0); // nessuna giornata positiva
    expect(result.score).toBe("0.00");
  });

  it("storico vuoto → null, mai un punteggio finto", () => {
    expect(
      radarScore({
        total: 0,
        wins: 0,
        losses: 0,
        winSum: "0",
        lossSum: "0",
        netPnl: "0",
        maxDrawdown: "0",
        maxDrawdownPct: null,
        daily: [],
      }),
    ).toBeNull();
  });

  it("un solo trade: punteggio calcolabile ma marcato lowSample", () => {
    const result = radarScore({
      total: 1,
      wins: 1,
      losses: 0,
      winSum: "100.00",
      lossSum: "0.00",
      netPnl: "100.00",
      maxDrawdown: "0.00",
      maxDrawdownPct: "0.0000",
      daily: [{ netPnl: "100.00" }],
    })!;
    expect(result.lowSample).toBe(true);
    expect(result.total).toBe(1);
    // Un giorno solo positivo: tutta la consistenza in una giornata → 0.
    expect(result.factors.consistency).toBe(0);
  });

  it("soglia lowSample coerente con SQN/Optimal f (30 trade)", () => {
    expect(SCORE_MIN_TRADES).toBe(30);
    const at = radarScore({ ...base, total: 30 })!;
    const below = radarScore({ ...base, total: 29 })!;
    expect(at.lowSample).toBe(false);
    expect(below.lowSample).toBe(true);
  });

  it("drawdown % indefinibile (picco ≤ 0) → fattore neutro 50", () => {
    // Regressione ereditata dal compositeScore: pct null "indefinibile"
    // non è pct "0.0000" (nessun drawdown, fattore pieno).
    const dd = maxDrawdown([
      { day: "2026-07-01", netPnl: "-100", trades: 1 },
      { day: "2026-07-02", netPnl: "-200", trades: 1 },
    ]);
    expect(dd.maxDrawdownPct).toBeNull();
    const result = radarScore({
      ...base,
      maxDrawdownPct: dd.maxDrawdownPct,
    })!;
    expect(result.factors.maxDrawdown).toBe(50);
  });

  it("sole giornate positive: nessun drawdown → fattore DD pieno", () => {
    const dd = maxDrawdown(
      [
        { day: "2026-07-01", netPnl: "200", trades: 2 },
        { day: "2026-07-02", netPnl: "100", trades: 1 },
      ],
      "10000",
    );
    expect(dd.maxDrawdownPct).toBe("0.0000");
    const result = radarScore({ ...base, maxDrawdownPct: dd.maxDrawdownPct })!;
    expect(result.factors.maxDrawdown).toBe(100);
  });

  it("clamp: nessun fattore supera 100 né scende sotto 0, mai score > 100", () => {
    const result = radarScore({
      total: 50,
      wins: 45,
      losses: 5,
      winSum: "50000.00",
      lossSum: "-100.00",
      netPnl: "49900.00",
      maxDrawdown: "50.00",
      maxDrawdownPct: "0.0010",
      daily: [{ netPnl: "25000.00" }, { netPnl: "24900.00" }],
    })!;
    for (const value of Object.values(result.factors)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(Number(result.score)).toBeLessThanOrEqual(100);
  });

  it("consistency: profitto spalmato batte profitto concentrato", () => {
    const spread = radarScore({
      ...base,
      daily: Array.from({ length: 10 }, () => ({ netPnl: "500.00" })),
    })!;
    const concentrated = radarScore({
      ...base,
      daily: [{ netPnl: "5000.00" }, { netPnl: "-500.00" }],
    })!;
    expect(spread.factors.consistency).toBe(90); // 1 − 500/5000
    expect(concentrated.factors.consistency).toBe(0); // tutto in un giorno
    expect(Number(spread.score)).toBeGreaterThan(Number(concentrated.score));
  });
});
