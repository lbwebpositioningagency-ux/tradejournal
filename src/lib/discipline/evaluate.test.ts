import { describe, expect, it } from "vitest";
import { effectiveRules, type DisciplineRuleType, type EffectiveRule } from "./catalog";
import {
  FOLLOW_RATE_MIN_DAYS,
  evaluateDays,
  evaluateRule,
  inPeriod,
  isWeekendDay,
  ruleStats,
  summarizePeriod,
  type DayFacts,
} from "./evaluate";

/** Giornata vuota (mercoledì) da cui ogni caso parte. */
function facts(patch: Partial<DayFacts> = {}): DayFacts {
  return {
    day: "2026-07-15",
    opened: 0,
    missingStop: 0,
    maxPlannedRisk: null,
    minTargetR: null,
    openedBySession: { ASIA: 0, LONDON: 0, NEWYORK: 0, OFF: 0 },
    lossBeforeOpenSameDay: false,
    minMinutesAfterLoss: null,
    maxOpenPositions: 0,
    maxQuantityBySymbol: {},
    closed: 0,
    netPnl: "0",
    worstTradeNet: null,
    lossesWithStop: 0,
    worstLossPriceR: null,
    maxConsecutiveLosses: 0,
    ...patch,
  };
}

/** Regola con i valori di partenza, attivata, con eventuali modifiche. */
function rule(type: DisciplineRuleType, patch: Partial<EffectiveRule> = {}): EffectiveRule {
  const base = effectiveRules([]).find((r) => r.type === type)!;
  return { ...base, isActive: true, ...patch };
}

const USD = "USD";

describe("STOP_PRESENT", () => {
  const r = rule("STOP_PRESENT");
  it("rispettata: tutti gli aperti hanno lo stop", () => {
    expect(evaluateRule(r, facts({ opened: 2 }), USD)).toBe("respected");
  });
  it("violata: uno stop mancante basta (anche se la causa è l'import MT5)", () => {
    expect(evaluateRule(r, facts({ opened: 2, missingStop: 1 }), USD)).toBe("violated");
  });
  it("non applicabile senza aperture", () => {
    expect(evaluateRule(r, facts({ closed: 1, netPnl: "-50", worstTradeNet: "-50" }), USD)).toBe("na");
  });
});

describe("STOP_RESPECTED (tolleranza 0,1R)", () => {
  const r = rule("STOP_RESPECTED");
  it("rispettata: perdita a −1,1R esatto, sul confine", () => {
    expect(evaluateRule(r, facts({ closed: 1, lossesWithStop: 1, worstLossPriceR: "-1.1" }), USD)).toBe("respected");
  });
  it("violata: oltre la tolleranza", () => {
    expect(evaluateRule(r, facts({ closed: 1, lossesWithStop: 1, worstLossPriceR: "-1.1001" }), USD)).toBe("violated");
  });
  it("tolleranza zero: −1,0001R è già violazione", () => {
    const zero = rule("STOP_RESPECTED", { rValue: "0" });
    expect(evaluateRule(zero, facts({ closed: 1, lossesWithStop: 1, worstLossPriceR: "-1.0001" }), USD)).toBe("violated");
  });
  it("non applicabile con soli trade in utile (decisione del 16/09/2026)", () => {
    expect(evaluateRule(r, facts({ closed: 3, netPnl: "900", worstTradeNet: "120" }), USD)).toBe("na");
  });
});

describe("MAX_LOSS_PER_TRADE (700 USD)", () => {
  const r = rule("MAX_LOSS_PER_TRADE");
  it("rispettata sul confine esatto", () => {
    expect(evaluateRule(r, facts({ closed: 1, worstTradeNet: "-700.00" }), USD)).toBe("respected");
  });
  it("violata di un centesimo", () => {
    expect(evaluateRule(r, facts({ closed: 1, worstTradeNet: "-700.01" }), USD)).toBe("violated");
  });
  it("non applicabile in una valuta senza soglia: mai convertire, mai sommare", () => {
    expect(evaluateRule(r, facts({ closed: 1, worstTradeNet: "-5000" }), "EUR")).toBe("na");
  });
  it("una soglia per valuta", () => {
    const eur = rule("MAX_LOSS_PER_TRADE", {
      currencyLimits: [
        { currency: "EUR", amount: "300.00" },
        { currency: "USD", amount: "700.00" },
      ],
    });
    expect(evaluateRule(eur, facts({ closed: 1, worstTradeNet: "-400" }), "EUR")).toBe("violated");
    expect(evaluateRule(eur, facts({ closed: 1, worstTradeNet: "-400" }), "USD")).toBe("respected");
  });
});

describe("MAX_DAILY_LOSS (1.000 USD)", () => {
  const r = rule("MAX_DAILY_LOSS");
  it("rispettata", () => {
    expect(evaluateRule(r, facts({ closed: 3, netPnl: "-999.99" }), USD)).toBe("respected");
  });
  it("violata", () => {
    expect(evaluateRule(r, facts({ closed: 3, netPnl: "-1000.01" }), USD)).toBe("violated");
  });
  it("non applicabile senza chiusure", () => {
    expect(evaluateRule(r, facts({ opened: 1 }), USD)).toBe("na");
  });
});

describe("MAX_TRADES_PER_DAY (5)", () => {
  const r = rule("MAX_TRADES_PER_DAY");
  it("rispettata a 5", () => expect(evaluateRule(r, facts({ opened: 5 }), USD)).toBe("respected"));
  it("violata a 6", () => expect(evaluateRule(r, facts({ opened: 6 }), USD)).toBe("violated"));
  it("conta le aperture, non le chiusure", () => {
    expect(evaluateRule(r, facts({ closed: 9, netPnl: "10" }), USD)).toBe("na");
  });
});

describe("MAX_PLANNED_RISK (500 USD)", () => {
  const r = rule("MAX_PLANNED_RISK");
  it("rispettata", () => expect(evaluateRule(r, facts({ opened: 1, maxPlannedRisk: "500.00" }), USD)).toBe("respected"));
  it("violata", () => expect(evaluateRule(r, facts({ opened: 1, maxPlannedRisk: "500.01" }), USD)).toBe("violated"));
  it("non applicabile senza rischio pianificato", () => {
    expect(evaluateRule(r, facts({ opened: 1, missingStop: 1 }), USD)).toBe("na");
  });
});

describe("MIN_TARGET_R (1,0)", () => {
  const r = rule("MIN_TARGET_R");
  it("rispettata a 1", () => expect(evaluateRule(r, facts({ opened: 1, minTargetR: "1.0000" }), USD)).toBe("respected"));
  it("violata a 0,9091", () => expect(evaluateRule(r, facts({ opened: 1, minTargetR: "0.9091" }), USD)).toBe("violated"));
  it("non applicabile senza target", () => expect(evaluateRule(r, facts({ opened: 1 }), USD)).toBe("na"));
});

describe("TRADING_HOURS (Asia, Londra, New York, no weekend)", () => {
  const r = rule("TRADING_HOURS");
  const sessions = (patch: Partial<DayFacts["openedBySession"]>) => ({ ASIA: 0, LONDON: 0, NEWYORK: 0, OFF: 0, ...patch });
  it("rispettata", () => {
    expect(evaluateRule(r, facts({ opened: 2, openedBySession: sessions({ LONDON: 1, NEWYORK: 1 }) }), USD)).toBe("respected");
  });
  it("violata: un'apertura fuori sessione", () => {
    expect(evaluateRule(r, facts({ opened: 2, openedBySession: sessions({ LONDON: 1, OFF: 1 }) }), USD)).toBe("violated");
  });
  it("violata: apertura di sabato", () => {
    expect(isWeekendDay("2026-07-18")).toBe(true);
    expect(evaluateRule(r, facts({ day: "2026-07-18", opened: 1, openedBySession: sessions({ LONDON: 1 }) }), USD)).toBe("violated");
  });
  it("weekend ammesso se l'utente lo sceglie", () => {
    const weekend = rule("TRADING_HOURS", { allowWeekend: true });
    expect(evaluateRule(weekend, facts({ day: "2026-07-18", opened: 1, openedBySession: sessions({ LONDON: 1 }) }), USD)).toBe("respected");
  });
});

describe("COOLDOWN_AFTER_LOSS (15 minuti)", () => {
  const r = rule("COOLDOWN_AFTER_LOSS");
  it("violata: apertura 14 minuti dopo una perdita", () => {
    expect(evaluateRule(r, facts({ opened: 1, lossBeforeOpenSameDay: true, minMinutesAfterLoss: "14.5" }), USD)).toBe("violated");
  });
  it("violata anche se la perdita era la sera prima (a cavallo della mezzanotte)", () => {
    expect(evaluateRule(r, facts({ opened: 1, lossBeforeOpenSameDay: false, minMinutesAfterLoss: "5" }), USD)).toBe("violated");
  });
  it("rispettata: pausa di 15 minuti esatti dopo una perdita dello stesso giorno", () => {
    expect(evaluateRule(r, facts({ opened: 1, lossBeforeOpenSameDay: true, minMinutesAfterLoss: "15" }), USD)).toBe("respected");
  });
  it("non applicabile se nessuna perdita precede le aperture del giorno", () => {
    expect(evaluateRule(r, facts({ opened: 2, minMinutesAfterLoss: "2880" }), USD)).toBe("na");
  });
});

describe("MAX_CONSECUTIVE_LOSSES (3)", () => {
  const r = rule("MAX_CONSECUTIVE_LOSSES");
  it("rispettata a 3", () => expect(evaluateRule(r, facts({ closed: 4, maxConsecutiveLosses: 3 }), USD)).toBe("respected"));
  it("violata a 4", () => expect(evaluateRule(r, facts({ closed: 4, maxConsecutiveLosses: 4 }), USD)).toBe("violated"));
});

describe("MAX_OPEN_POSITIONS (2)", () => {
  const r = rule("MAX_OPEN_POSITIONS");
  it("rispettata a 2", () => expect(evaluateRule(r, facts({ opened: 1, maxOpenPositions: 2 }), USD)).toBe("respected"));
  it("violata a 3", () => expect(evaluateRule(r, facts({ opened: 1, maxOpenPositions: 3 }), USD)).toBe("violated"));
});

describe("MAX_QUANTITY_PER_SYMBOL", () => {
  it("non applicabile finché nessun simbolo ha una soglia", () => {
    expect(evaluateRule(rule("MAX_QUANTITY_PER_SYMBOL"), facts({ opened: 1, maxQuantityBySymbol: { ES: "3" } }), USD)).toBe("na");
  });
  const r = rule("MAX_QUANTITY_PER_SYMBOL", { symbolLimits: [{ symbol: "ES", quantity: "2" }] });
  it("rispettata sul simbolo con soglia", () => {
    expect(evaluateRule(r, facts({ opened: 2, maxQuantityBySymbol: { ES: "2.00000000", NQ: "9" } }), USD)).toBe("respected");
  });
  it("violata", () => {
    expect(evaluateRule(r, facts({ opened: 1, maxQuantityBySymbol: { ES: "3.00000000" } }), USD)).toBe("violated");
  });
  it("non applicabile se oggi il simbolo con soglia non è stato aperto", () => {
    expect(evaluateRule(r, facts({ opened: 1, maxQuantityBySymbol: { NQ: "9" } }), USD)).toBe("na");
  });
});

describe("punteggio giornaliero", () => {
  const rules = effectiveRules([]); // le cinque attive di default

  it("rispettate su applicabili, solo regole attive", () => {
    const [day] = evaluateDays(
      [facts({ opened: 2, missingStop: 1, closed: 2, netPnl: "-300", worstTradeNet: "-200", lossesWithStop: 1, worstLossPriceR: "-0.9" })],
      rules,
      USD,
    );
    // STOP_PRESENT violata; STOP_RESPECTED, per trade, giornaliera, trade/giorno rispettate.
    expect(day.results.STOP_PRESENT).toBe("violated");
    expect(day.results.MIN_TARGET_R).toBeUndefined(); // spenta: non entra nemmeno fra le applicabili
    expect([day.respected, day.applicable]).toEqual([4, 5]);
    expect(day.score).toBe("0.800000");
  });

  it("le regole non applicabili escono dal denominatore", () => {
    const [day] = evaluateDays([facts({ opened: 1 })], rules, USD);
    // Solo STOP_PRESENT e MAX_TRADES_PER_DAY sono applicabili (nessuna chiusura).
    expect([day.respected, day.applicable, day.score]).toEqual([2, 2, "1.000000"]);
  });

  it("giornate senza trade non sono giornate operative; zero regole attive → punteggio nullo", () => {
    expect(evaluateDays([facts()], rules, USD)).toHaveLength(0);
    const spente = rules.map((r) => ({ ...r, isActive: false }));
    const [day] = evaluateDays([facts({ opened: 1 })], spente, USD);
    expect(day.score).toBeNull();
  });

  it("tutte violate → 0", () => {
    const [day] = evaluateDays(
      [facts({ opened: 6, missingStop: 6, closed: 1, netPnl: "-1500", worstTradeNet: "-1500", lossesWithStop: 1, worstLossPriceR: "-3" })],
      rules,
      USD,
    );
    expect(day.score).toBe("0.000000");
  });
});

describe("streak, follow rate e periodo", () => {
  const r = [rule("STOP_RESPECTED")];
  const loss = (day: string, R: string) => facts({ day, closed: 1, lossesWithStop: 1, worstLossPriceR: R, netPnl: "-100", worstTradeNet: "-100" });
  const win = (day: string) => facts({ day, closed: 1, netPnl: "100", worstTradeNet: "100" });

  it("le giornate non applicabili non spezzano e non allungano la serie", () => {
    const evals = evaluateDays(
      [loss("2026-07-01", "-2"), loss("2026-07-02", "-1"), win("2026-07-03"), loss("2026-07-06", "-0.5"), win("2026-07-07")],
      r,
      USD,
    );
    const stats = ruleStats("STOP_RESPECTED", evals);
    expect(stats).toMatchObject({ currentStreak: 2, bestStreak: 2, respectedDays: 2, violatedDays: 1 });
    expect(stats.followRate).toBe("0.666667");
    expect(stats.last).toEqual({ day: "2026-07-06", status: "respected" });
  });

  it("una violazione azzera la serie in corso ma non la migliore", () => {
    const evals = evaluateDays(
      [loss("2026-07-01", "-1"), loss("2026-07-02", "-1"), loss("2026-07-03", "-1"), loss("2026-07-06", "-5")],
      r,
      USD,
    );
    expect(ruleStats("STOP_RESPECTED", evals)).toMatchObject({ currentStreak: 0, bestStreak: 3 });
  });

  it("follow rate affidabile solo sopra il campione minimo", () => {
    const giorni = Array.from({ length: FOLLOW_RATE_MIN_DAYS }, (_, i) => loss(`2026-06-${String(i + 1).padStart(2, "0")}`, "-1"));
    expect(ruleStats("STOP_RESPECTED", evaluateDays(giorni.slice(1), r, USD)).reliable).toBe(false);
    expect(ruleStats("STOP_RESPECTED", evaluateDays(giorni, r, USD)).reliable).toBe(true);
  });

  it("nessuna giornata applicabile → follow rate nullo, mai 0% né 100%", () => {
    const stats = ruleStats("STOP_RESPECTED", evaluateDays([win("2026-07-01")], r, USD));
    expect(stats.followRate).toBeNull();
    expect(stats.currentStreak).toBe(0);
  });

  it("riepilogo del periodo: punteggio complessivo, giornate perfette, serie perfetta in corso", () => {
    const rules = effectiveRules([]);
    const evals = evaluateDays(
      [
        facts({ day: "2026-07-01", opened: 1 }),
        facts({ day: "2026-07-02", opened: 1, missingStop: 1 }),
        facts({ day: "2026-07-03", opened: 1 }),
        facts({ day: "2026-07-06", opened: 1 }),
      ],
      rules,
      USD,
    );
    const summary = summarizePeriod(evals);
    expect(summary).toMatchObject({ days: 4, respected: 7, applicable: 8, perfectDays: 3, currentPerfectStreak: 2, reliable: false });
    expect(summary.score).toBe("0.875000");
    expect(inPeriod(evals, "2026-07-02", "2026-07-06").map((e) => e.day)).toEqual(["2026-07-02", "2026-07-03"]);
  });

  it("periodo senza giornate → punteggio nullo", () => {
    expect(summarizePeriod([]).score).toBeNull();
  });
});
