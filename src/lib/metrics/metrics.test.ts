import { describe, expect, it } from "vitest";
import {
  avgLoss,
  avgWin,
  calmarRatio,
  coveredDays,
  CALMAR_MIN_DAYS,
  classifyOutcome,
  compositeScore,
  currentDayStreak,
  currentStreak,
  dayStats,
  dayStreakSummary,
  expectancy,
  maxDrawdown,
  payoffRatio,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  sqn,
  SQN_MIN_TRADES,
  streakSummary,
  ulcerIndex,
  winRate,
  type DailyPnl,
  type TradeOutcome,
} from "./index";

describe("classifyOutcome", () => {
  it("classifica win, loss e breakeven", () => {
    expect(classifyOutcome("10.50")).toBe("WIN");
    expect(classifyOutcome("-0.01")).toBe("LOSS");
    expect(classifyOutcome("0")).toBe("BREAKEVEN");
    expect(classifyOutcome("0.00")).toBe("BREAKEVEN");
  });
});

describe("winRate", () => {
  it("caso noto: 55 vincenti su 100", () => {
    expect(winRate(55, 100)).toBe("0.5500");
  });

  it("i breakeven diluiscono il tasso (denominatore, non numeratore)", () => {
    // 5 win, 3 loss, 2 be → 5/10
    expect(winRate(5, 10)).toBe("0.5000");
  });

  it("zero trade → null", () => {
    expect(winRate(0, 0)).toBeNull();
  });

  it("tutti loss → 0", () => {
    expect(winRate(0, 8)).toBe("0.0000");
  });
});

describe("profitFactor", () => {
  it("caso noto: 3000 di profitti, 1500 di perdite → 2", () => {
    expect(profitFactor("3000", "-1500")).toBe("2.0000");
  });

  it("sotto 1 quando le perdite superano i profitti", () => {
    expect(profitFactor("500", "-1000")).toBe("0.5000");
  });

  it("divisione per zero (nessuna perdita) → null", () => {
    expect(profitFactor("3000", "0")).toBeNull();
    expect(profitFactor("0", "0.00")).toBeNull();
  });

  it("tutti loss → 0", () => {
    expect(profitFactor("0", "-800")).toBe("0.0000");
  });
});

describe("avgWin / avgLoss / payoffRatio", () => {
  it("medie su casi noti", () => {
    expect(avgWin("900", 3)).toBe("300.00");
    expect(avgLoss("-450", 3)).toBe("150.00"); // grandezza positiva
  });

  it("zero vincenti o zero perdenti → null", () => {
    expect(avgWin("0", 0)).toBeNull();
    expect(avgLoss("0", 0)).toBeNull();
  });

  it("payoff ratio e i suoi null", () => {
    expect(payoffRatio("300.00", "150.00")).toBe("2.0000");
    expect(payoffRatio(null, "150.00")).toBeNull();
    expect(payoffRatio("300.00", null)).toBeNull();
    expect(payoffRatio("300.00", "0.00")).toBeNull();
  });
});

describe("expectancy", () => {
  it("caso noto: 60% win da 100, 40% loss da 50 → 40", () => {
    // 6 win × 100 = 600 · 4 loss × 50 = -200 → (0.6×100) − (0.4×50) = 40
    expect(
      expectancy({ total: 10, wins: 6, losses: 4, winSum: "600", lossSum: "-200" }),
    ).toBe("40.00");
  });

  it("coincide con netPnl/totale anche con breakeven", () => {
    // 2 win (300), 1 loss (-100), 1 be → net 200 / 4 = 50
    expect(
      expectancy({ total: 4, wins: 2, losses: 1, winSum: "300", lossSum: "-100" }),
    ).toBe("50.00");
  });

  it("zero trade → null", () => {
    expect(
      expectancy({ total: 0, wins: 0, losses: 0, winSum: "0", lossSum: "0" }),
    ).toBeNull();
  });

  it("tutti loss → expectancy negativa", () => {
    expect(
      expectancy({ total: 4, wins: 0, losses: 4, winSum: "0", lossSum: "-400" }),
    ).toBe("-100.00");
  });
});

describe("maxDrawdown", () => {
  const day = (d: string, pnl: string): DailyPnl => ({
    day: d,
    netPnl: pnl,
    trades: 1,
  });

  it("caso noto: picco a 1200, discesa a 800 → dd 400, pct su 11200", () => {
    const result = maxDrawdown(
      [
        day("2026-07-01", "1000"), // equity 11000, picco
        day("2026-07-02", "200"), // 11200, picco
        day("2026-07-03", "-300"), // 10900, dd 300
        day("2026-07-06", "-100"), // 10800, dd 400  ← max
        day("2026-07-07", "500"), // 11300, nuovo picco
      ],
      "10000",
    );
    expect(result.maxDrawdown).toBe("400.00");
    expect(result.maxDrawdownPct).toBe("0.0357"); // 400 / 11200
    expect(result.date).toBe("2026-07-06");
    expect(result.avgDrawdown).toBe("350.00"); // (300+400)/2
  });

  it("solo giornate positive → nessun drawdown, pct 0 (non null)", () => {
    const result = maxDrawdown([day("2026-07-01", "100"), day("2026-07-02", "50")]);
    expect(result.maxDrawdown).toBe("0.00");
    expect(result.maxDrawdownPct).toBe("0.0000"); // zero drawdown è uno 0% definito
    expect(result.date).toBeNull();
    expect(result.avgDrawdown).toBe("0.00");
  });

  it("serie vuota (zero trade) → zeri, pct 0", () => {
    const result = maxDrawdown([]);
    expect(result.maxDrawdown).toBe("0.00");
    expect(result.maxDrawdownPct).toBe("0.0000");
    expect(result.date).toBeNull();
  });

  it("tutti loss senza saldo iniziale → dd cresce, pct null (picco 0)", () => {
    const result = maxDrawdown([day("2026-07-01", "-100"), day("2026-07-02", "-200")]);
    expect(result.maxDrawdown).toBe("300.00");
    expect(result.maxDrawdownPct).toBeNull(); // picco di equity = 0
    expect(result.date).toBe("2026-07-02");
  });

  it("tutti loss con saldo iniziale → pct sul saldo", () => {
    const result = maxDrawdown(
      [day("2026-07-01", "-100"), day("2026-07-02", "-100")],
      "1000",
    );
    expect(result.maxDrawdown).toBe("200.00");
    expect(result.maxDrawdownPct).toBe("0.2000");
  });
});

describe("currentStreak", () => {
  const w = "WIN" as TradeOutcome;
  const l = "LOSS" as TradeOutcome;
  const b = "BREAKEVEN" as TradeOutcome;

  it("streak vincente in testa (ordine: più recente prima)", () => {
    expect(currentStreak([w, w, w, l, w])).toEqual({ direction: "WIN", length: 3 });
  });

  it("streak perdente", () => {
    expect(currentStreak([l, l, w])).toEqual({ direction: "LOSS", length: 2 });
  });

  it("breakeven in testa interrompe", () => {
    expect(currentStreak([b, w, w])).toEqual({ direction: "NONE", length: 0 });
  });

  it("breakeven interno chiude la streak", () => {
    expect(currentStreak([w, b, w])).toEqual({ direction: "WIN", length: 1 });
  });

  it("zero trade → NONE", () => {
    expect(currentStreak([])).toEqual({ direction: "NONE", length: 0 });
  });

  it("streak di giornate dal P&L", () => {
    const days = [{ netPnl: "120.00" }, { netPnl: "35.00" }, { netPnl: "-80.00" }];
    expect(currentDayStreak(days)).toEqual({ direction: "WIN", length: 2 });
  });
});

describe("compositeScore", () => {
  it("trader solido: PF 2, dd 5%, 60% giorni verdi → 85", () => {
    // prof = 2/2.5 = 0.8 → 0.32 · risk = 1−0.05/0.20 = 0.75 → 0.225
    // cons = 0.6/0.6 = 1 → 0.30 · totale 0.845 → 85 (arrotondato)
    const score = compositeScore({
      total: 100,
      wins: 55,
      losses: 45,
      winSum: "9000",
      lossSum: "-4500",
      maxDrawdownPct: "0.0500",
      dayWinRate: "0.6000",
    });
    expect(score).toBe(85);
  });

  it("nessuna perdita e almeno un profitto → profittabilità al massimo", () => {
    const score = compositeScore({
      total: 10,
      wins: 10,
      losses: 0,
      winSum: "1000",
      lossSum: "0",
      maxDrawdownPct: "0.0000",
      dayWinRate: "1.0000",
    });
    expect(score).toBe(100);
  });

  it("tutti loss → punteggio minimo di profittabilità e consistenza", () => {
    // prof 0 · risk 1−0.25/0.2 → clamp 0 · cons 0 → score 0
    const score = compositeScore({
      total: 10,
      wins: 0,
      losses: 10,
      winSum: "0",
      lossSum: "-1000",
      maxDrawdownPct: "0.2500",
      dayWinRate: "0.0000",
    });
    expect(score).toBe(0);
  });

  it("zero trade → null", () => {
    expect(
      compositeScore({
        total: 0,
        wins: 0,
        losses: 0,
        winSum: "0",
        lossSum: "0",
        maxDrawdownPct: null,
        dayWinRate: null,
      }),
    ).toBeNull();
  });

  it("drawdown % indefinibile → componente risk neutra (0.5)", () => {
    // prof: PF 1 → 0.4 → 0.16 · risk 0.5 → 0.15 · cons 0.5/0.6 → 0.25
    const score = compositeScore({
      total: 10,
      wins: 5,
      losses: 5,
      winSum: "500",
      lossSum: "-500",
      maxDrawdownPct: null,
      dayWinRate: "0.5000",
    });
    expect(score).toBe(56); // 0.16+0.15+0.25 = 0.56
  });

  it("composizione maxDrawdown → score: sole giornate positive = risk pieno", () => {
    // Regressione: il pct null di "nessun drawdown" veniva trattato come
    // "indefinibile" (risk 0.5) e un conto perfetto non superava 85.
    const dd = maxDrawdown(
      [
        { day: "2026-07-01", netPnl: "200", trades: 2 },
        { day: "2026-07-02", netPnl: "100", trades: 1 },
      ],
      "10000",
    );
    expect(dd.maxDrawdownPct).toBe("0.0000");

    const score = compositeScore({
      total: 3,
      wins: 3,
      losses: 0,
      winSum: "300",
      lossSum: "0",
      maxDrawdownPct: dd.maxDrawdownPct,
      dayWinRate: "1.0000",
    });
    expect(score).toBe(100);
  });

  it("drawdown reale con picco ≤ 0 → pct null → risk neutro, non pieno", () => {
    const dd = maxDrawdown([
      { day: "2026-07-01", netPnl: "-100", trades: 1 },
      { day: "2026-07-02", netPnl: "-200", trades: 1 },
    ]);
    expect(dd.maxDrawdown).toBe("300.00");
    expect(dd.maxDrawdownPct).toBeNull(); // esiste un drawdown ma il picco è 0
  });

  it("il clamp impedisce score > 100 anche con PF estremo", () => {
    const score = compositeScore({
      total: 50,
      wins: 40,
      losses: 10,
      winSum: "50000",
      lossSum: "-100",
      maxDrawdownPct: "0.0010",
      dayWinRate: "0.9000",
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ───────────────────────── FASE 9 — metriche avanzate ─────────────────────────

const d = (values: string[]) => values.map((netPnl) => ({ netPnl }));

describe("sortinoRatio", () => {
  it("caso noto a mano: [100, -50, 50] → 1.1547", () => {
    // media = 100/3; downside dev = √(2500/3) = 28.8675…; ratio = 1.15470…
    expect(sortinoRatio(d(["100", "-50", "50"]))).toBe("1.1547");
  });

  it("il MAR sposta sia il numeratore sia le deviazioni: MAR=10 → 0.6736", () => {
    // (100/3 − 10) / √(3600/3) = 23.3333… / 34.6410… = 0.67357…
    expect(sortinoRatio(d(["100", "-50", "50"]), "10")).toBe("0.6736");
  });

  it("nessun rendimento sotto il MAR (downside dev zero) → null, mai infinito", () => {
    expect(sortinoRatio(d(["100", "0", "50"]))).toBeNull();
  });

  it("serie tutta negativa: ratio negativo, non null", () => {
    // media −50, downside dev 50 → −1
    expect(sortinoRatio(d(["-50", "-50"]))).toBe("-1.0000");
  });

  it("zero giorni → null", () => {
    expect(sortinoRatio([])).toBeNull();
  });
});

describe("sharpeRatio", () => {
  it("caso noto a mano: [100, -50, 50] → 0.5345", () => {
    // media 100/3; dev std di popolazione √(105000/27) = 62.3609…; 0.53452…
    expect(sharpeRatio(d(["100", "-50", "50"]))).toBe("0.5345");
  });

  it("penalizza anche la volatilità positiva: Sharpe < Sortino sulla stessa serie", () => {
    const series = d(["100", "-50", "50"]);
    expect(Number(sharpeRatio(series))).toBeLessThan(
      Number(sortinoRatio(series)),
    );
  });

  it("rendimenti tutti uguali (dev std zero) → null", () => {
    expect(sharpeRatio(d(["50", "50", "50"]))).toBeNull();
  });

  it("media negativa → ratio negativo", () => {
    // media −50; devs ±50 e 0 → dev std √(5000/3) = 40.8248…; −1.22474…
    expect(sharpeRatio(d(["-100", "0", "-50"]))).toBe("-1.2247");
  });

  it("zero giorni → null", () => {
    expect(sharpeRatio([])).toBeNull();
  });
});

describe("sqn", () => {
  it("caso noto a mano: 30 trade, metà R=2 e metà R=0 → 5.48", () => {
    // media 1; var = 60/30 − 1 = 1; √30 × 1 / 1 = 5.4772…
    expect(sqn(30, "30", "60")).toBe("5.48");
  });

  it("sotto la soglia di significatività → null, mai un numero", () => {
    expect(SQN_MIN_TRADES).toBe(30);
    expect(sqn(29, "29", "58")).toBeNull();
    expect(sqn(0, "0", "0")).toBeNull();
  });

  it("R tutti uguali (dev std zero) → null", () => {
    // 30 trade con R=1.5: ΣR=45, ΣR²=67.5 → varianza 0
    expect(sqn(30, "45", "67.5")).toBeNull();
  });

  it("sistema perdente: SQN negativo", () => {
    expect(sqn(30, "-30", "60")).toBe("-5.48");
  });

  it("Q-06 — cap SQN-100: oltre 100 trade il √N smette di crescere", () => {
    // Stesso sistema (media 1, sd 1) su 120 trade: senza cap varrebbe
    // √120 ≈ 10.95; con SQN-100 vale √100 × 1 / 1 = 10 esatto.
    expect(sqn(120, "120", "240")).toBe("10.00");
    // A 100 trade cap e N coincidono: √100 × 1 = 10.
    expect(sqn(100, "100", "200")).toBe("10.00");
    // Sotto il cap nulla cambia (√30, il caso noto sopra).
    expect(sqn(30, "30", "60")).toBe("5.48");
  });
});

describe("calmarRatio", () => {
  const day = (day: string, netPnl: string) => ({ day, netPnl });

  it("caso noto a mano: +10% su un anno pieno, Max DD 5% → 2.00", () => {
    const days = [day("2026-01-01", "500"), day("2026-12-31", "500")];
    expect(calmarRatio(days, "10000", "0.0500")).toBe("2.00");
  });

  it("annualizza sul periodo effettivo (>= soglia), non su un anno pieno", () => {
    // span 2026-01-01 → 2026-06-30 = 181 giorni (supera il gate);
    // +1% sul periodo → ×365/181 = +2,0166% annuo; / 5% DD = 0.40
    const days = [day("2026-01-01", "100"), day("2026-06-30", "0")];
    expect(calmarRatio(days, "10000", "0.0500")).toBe("0.40");
  });

  it("gate storico: sotto CALMAR_MIN_DAYS giorni coperti → null (non affidabile)", () => {
    // un solo giorno coperto, storico troppo corto per annualizzare
    expect(calmarRatio([day("2026-07-01", "100")], "10000", "0.1000")).toBeNull();
    // ~90 giorni: ancora sotto la soglia dei 180
    const shortSpan = [day("2026-01-01", "500"), day("2026-03-31", "100")];
    expect(calmarRatio(shortSpan, "10000", "0.0500")).toBeNull();
  });

  it("nessun drawdown (pct zero o null) → null, mai infinito", () => {
    const days = [day("2026-01-01", "500")];
    expect(calmarRatio(days, "10000", "0.0000")).toBeNull();
    expect(calmarRatio(days, "10000", null)).toBeNull();
  });

  it("saldo iniziale zero o negativo → null (rendimento non definibile)", () => {
    const days = [day("2026-01-01", "500")];
    expect(calmarRatio(days, "0", "0.0500")).toBeNull();
    expect(calmarRatio(days, "-100", "0.0500")).toBeNull();
  });

  it("zero giorni → null", () => {
    expect(calmarRatio([], "10000", "0.0500")).toBeNull();
  });
});

describe("coveredDays / CALMAR_MIN_DAYS", () => {
  it("soglia a 180 giorni", () => {
    expect(CALMAR_MIN_DAYS).toBe(180);
  });

  it("conta i giorni di calendario coperti, estremi inclusi", () => {
    expect(coveredDays([])).toBe(0);
    expect(coveredDays([{ day: "2026-07-01" }])).toBe(1);
    expect(
      coveredDays([{ day: "2026-01-01" }, { day: "2026-12-31" }]),
    ).toBe(365);
    expect(
      coveredDays([{ day: "2026-01-01" }, { day: "2026-06-30" }]),
    ).toBe(181);
  });
});

describe("ulcerIndex", () => {
  it("caso noto a mano: saldo 1000, giorni [+1000, -500, +500] → 0.1443", () => {
    // equity 2000 (picco), 1500 (dd 25%), 2000 → √(0.0625/3) = 0.14433…
    expect(ulcerIndex(d(["1000", "-500", "500"]), "1000")).toBe("0.1443");
  });

  it("pesa la DURATA: stesso drawdown massimo tenuto più a lungo → UI più alto", () => {
    const breve = ulcerIndex(d(["1000", "-500", "500"]), "1000");
    const lungo = ulcerIndex(d(["1000", "-500", "0", "0", "500"]), "1000");
    // stesso max DD (25%) ma 3 giorni in drawdown invece di 1
    expect(lungo).toBe("0.1936");
    expect(Number(lungo)).toBeGreaterThan(Number(breve));
  });

  it("nessun drawdown → 0.0000 (zero legittimo, non null)", () => {
    expect(ulcerIndex(d(["100", "50"]), "1000")).toBe("0.0000");
  });

  it("picco ≤ 0 durante un drawdown → null (percentuale non definibile)", () => {
    expect(ulcerIndex(d(["-100"]), "0")).toBeNull();
  });

  it("zero giorni → null", () => {
    expect(ulcerIndex([], "1000")).toBeNull();
  });
});

// ──────────────────── Analytics: streak summary e day stats ────────────────────

describe("streakSummary", () => {
  const W = "WIN" as TradeOutcome;
  const L = "LOSS" as TradeOutcome;
  const B = "BREAKEVEN" as TradeOutcome;

  it("caso noto: serie [W,W,L,W,W,W,B,L,L] → max 3/2, medie 2.5/1.5", () => {
    expect(streakSummary([W, W, L, W, W, W, B, L, L])).toEqual({
      maxWin: 3,
      maxLoss: 2,
      avgWin: "2.5",
      avgLoss: "1.5",
    });
  });

  it("solo vittorie: la parte loss è 0/null, mai 0 finto sulla media", () => {
    expect(streakSummary([W, W])).toEqual({
      maxWin: 2,
      maxLoss: 0,
      avgWin: "2.0",
      avgLoss: null,
    });
  });

  it("zero trade o soli breakeven → tutto 0/null", () => {
    expect(streakSummary([])).toEqual({
      maxWin: 0,
      maxLoss: 0,
      avgWin: null,
      avgLoss: null,
    });
    expect(streakSummary([B, B])).toEqual({
      maxWin: 0,
      maxLoss: 0,
      avgWin: null,
      avgLoss: null,
    });
  });

  it("il breakeven spezza la serie (due run separati, non uno unico)", () => {
    // W,B,W: due serie da 1, non una da 2
    expect(streakSummary([W, B, W])).toEqual({
      maxWin: 1,
      maxLoss: 0,
      avgWin: "1.0",
      avgLoss: null,
    });
  });

  it("dayStreakSummary classifica le giornate dal P&L", () => {
    const days = [
      { netPnl: "100.00" },
      { netPnl: "-50.00" },
      { netPnl: "-30.00" },
      { netPnl: "0" },
      { netPnl: "20.00" },
    ];
    expect(dayStreakSummary(days)).toEqual({
      maxWin: 1,
      maxLoss: 2,
      avgWin: "1.0",
      avgLoss: "2.0",
    });
  });
});

describe("dayStats", () => {
  const d = (day: string, netPnl: string) => ({ day, netPnl });

  it("caso noto: conteggi, estremi con data e medie Decimal", () => {
    const result = dayStats([
      d("2026-07-01", "100.00"),
      d("2026-07-02", "-50.00"),
      d("2026-07-03", "300.00"),
      d("2026-07-06", "0"), // breakeven: fuori da entrambe le colonne
      d("2026-07-07", "-150.00"),
    ]);
    expect(result).toEqual({
      posDays: 2,
      negDays: 2,
      bestDay: { day: "2026-07-03", netPnl: "300.00" },
      worstDay: { day: "2026-07-07", netPnl: "-150.00" },
      avgPosDay: "200.00",
      avgNegDay: "-100.00",
    });
  });

  it("nessun giorno → zeri e null espliciti", () => {
    expect(dayStats([])).toEqual({
      posDays: 0,
      negDays: 0,
      bestDay: null,
      worstDay: null,
      avgPosDay: null,
      avgNegDay: null,
    });
  });

  it("tutti positivi: la colonna negativa resta null, mai 0 finto", () => {
    const result = dayStats([d("2026-07-01", "10.00"), d("2026-07-02", "30.00")]);
    expect(result.negDays).toBe(0);
    expect(result.worstDay).toBeNull();
    expect(result.avgNegDay).toBeNull();
    expect(result.avgPosDay).toBe("20.00");
  });
});
