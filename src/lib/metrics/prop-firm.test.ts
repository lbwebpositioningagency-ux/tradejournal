import { describe, expect, it } from "vitest";
import { propFirmStatus, type PropFirmRules } from "./prop-firm";

const NO_RULES: PropFirmRules = {
  dailyLossLimit: null,
  maxDrawdown: null,
  drawdownType: "STATIC",
  profitTarget: null,
  minTradingDays: null,
};

function status(
  rules: Partial<PropFirmRules>,
  daily: { day: string; netPnl: string }[],
  initialBalance = "25000",
  todayKey = "2026-07-25",
) {
  return propFirmStatus({
    rules: { ...NO_RULES, ...rules },
    initialBalance,
    daily,
    todayKey,
  });
}

describe("propFirmStatus — daily loss (F36)", () => {
  it("giorno in perdita: usato, residuo e percentuale", () => {
    const s = status({ dailyLossLimit: "1500" }, [
      { day: "2026-07-24", netPnl: "300" },
      { day: "2026-07-25", netPnl: "-930" },
    ]);
    expect(s?.dailyLoss).toEqual({
      lossToday: "930.00",
      limit: "1500.00",
      used: "0.62",
      remaining: "570.00",
      breached: false,
    });
    expect(s?.anyBreached).toBe(false);
  });

  it("giorno in verde o senza trade: zero consumato", () => {
    const green = status({ dailyLossLimit: "1500" }, [
      { day: "2026-07-25", netPnl: "420" },
    ]);
    expect(green?.dailyLoss?.lossToday).toBe("0.00");
    expect(green?.dailyLoss?.used).toBe("0");

    const empty = status({ dailyLossLimit: "1500" }, []);
    expect(empty?.dailyLoss?.remaining).toBe("1500.00");
  });

  it("violazione al RAGGIUNGIMENTO del limite (>=)", () => {
    const exact = status({ dailyLossLimit: "1500" }, [
      { day: "2026-07-25", netPnl: "-1500" },
    ]);
    expect(exact?.dailyLoss?.breached).toBe(true);
    expect(exact?.dailyLoss?.remaining).toBe("0.00");
    expect(exact?.anyBreached).toBe(true);

    const over = status({ dailyLossLimit: "1500" }, [
      { day: "2026-07-25", netPnl: "-2000" },
    ]);
    expect(over?.dailyLoss?.used).toBe("1.3333");
  });
});

describe("propFirmStatus — max drawdown (F36)", () => {
  const days = [
    { day: "2026-07-21", netPnl: "1000" }, // equity 26000
    { day: "2026-07-22", netPnl: "-2500" }, // 23500
    { day: "2026-07-23", netPnl: "500" }, // 24000
  ];

  it("statico: riferimento = saldo iniziale", () => {
    const s = status({ maxDrawdown: "3000", drawdownType: "STATIC" }, days);
    expect(s?.drawdown).toEqual({
      type: "STATIC",
      equity: "24000.00",
      peak: "25000.00",
      floor: "22000.00",
      used: "0.3333", // (25000-24000)/3000
      remaining: "2000.00",
      breached: false,
    });
  });

  it("trailing: il pavimento insegue il picco", () => {
    const s = status({ maxDrawdown: "3000", drawdownType: "TRAILING" }, days);
    expect(s?.drawdown?.peak).toBe("26000.00");
    expect(s?.drawdown?.floor).toBe("23000.00");
    // (26000-24000)/3000
    expect(s?.drawdown?.used).toBe("0.6667");
    expect(s?.drawdown?.breached).toBe(false);
  });

  it("violazione storica: chiusura sotto il pavimento resta violata anche dopo il recupero", () => {
    const crash = [
      { day: "2026-07-21", netPnl: "1000" }, // 26000 (picco)
      { day: "2026-07-22", netPnl: "-3200" }, // 22800 ≤ floor trailing 23000 → violato
      { day: "2026-07-23", netPnl: "2000" }, // 24800: recupero irrilevante
    ];
    const trailing = status(
      { maxDrawdown: "3000", drawdownType: "TRAILING" },
      crash,
    );
    expect(trailing?.drawdown?.breached).toBe(true);
    expect(trailing?.anyBreached).toBe(true);
    // Statico: floor 22000, mai toccato.
    const staticDd = status({ maxDrawdown: "3000", drawdownType: "STATIC" }, crash);
    expect(staticDd?.drawdown?.breached).toBe(false);
  });

  it("equity sopra il riferimento: usato zero, mai negativo", () => {
    const s = status({ maxDrawdown: "3000", drawdownType: "STATIC" }, [
      { day: "2026-07-21", netPnl: "2000" },
    ]);
    expect(s?.drawdown?.used).toBe("0");
    expect(s?.drawdown?.remaining).toBe("3000.00");
  });
});

describe("propFirmStatus — target e giornate (F36)", () => {
  it("profit target: progresso, residuo, raggiunto", () => {
    const s = status({ profitTarget: "2500" }, [
      { day: "2026-07-21", netPnl: "1000" },
      { day: "2026-07-22", netPnl: "500" },
    ]);
    expect(s?.profitTarget).toEqual({
      netPnl: "1500.00",
      target: "2500.00",
      progress: "0.6",
      remaining: "1000.00",
      reached: false,
    });
  });

  it("P&L negativo: progresso 0, mai negativo", () => {
    const s = status({ profitTarget: "2500" }, [
      { day: "2026-07-21", netPnl: "-800" },
    ]);
    expect(s?.profitTarget?.progress).toBe("0");
    expect(s?.profitTarget?.remaining).toBe("3300.00");
  });

  it("giornate operative minime", () => {
    const s = status({ minTradingDays: 5 }, [
      { day: "2026-07-21", netPnl: "10" },
      { day: "2026-07-22", netPnl: "0" }, // giorno a zero: conta comunque
      { day: "2026-07-23", netPnl: "-5" },
    ]);
    expect(s?.tradingDays).toEqual({ done: 3, required: 5, reached: false });
  });
});

describe("propFirmStatus — gate", () => {
  it("nessuna regola attiva → null (il widget non appare)", () => {
    expect(status({}, [{ day: "2026-07-21", netPnl: "10" }])).toBeNull();
  });

  it("regole non valide (zero, negative, spazzatura) contano come assenti", () => {
    expect(
      status(
        { dailyLossLimit: "0", maxDrawdown: "-5", profitTarget: "abc" },
        [],
      ),
    ).toBeNull();
  });

  it("le regole informative da sole non marcano violazioni", () => {
    const s = status({ profitTarget: "1000", minTradingDays: 3 }, [
      { day: "2026-07-21", netPnl: "-99999" },
    ]);
    expect(s?.anyBreached).toBe(false);
  });
});
