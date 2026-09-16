import { describe, expect, it } from "vitest";
import { effectiveRules, type DisciplineRuleType, type EffectiveRule } from "./catalog";
import { disciplineTier, monthLabel, monthsNewestFirst, ruleCondition, shortDay } from "./view";
import type { DayEvaluation } from "./evaluate";

const rule = (type: DisciplineRuleType, patch: Partial<EffectiveRule> = {}) => ({
  ...effectiveRules([]).find((r) => r.type === type)!,
  ...patch,
});

describe("gradino della heatmap della disciplina", () => {
  it("cresce col punteggio", () => {
    expect(disciplineTier(null)).toBe(0);
    expect(disciplineTier("0.000000")).toBe(1);
    expect(disciplineTier("0.499999")).toBe(1);
    expect(disciplineTier("0.500000")).toBe(2);
    expect(disciplineTier("0.800000")).toBe(2);
    expect(disciplineTier("1.000000")).toBe(3);
  });
});

describe("condizione della regola in parole", () => {
  it("soglie in valuta lette SOLO nella valuta attiva", () => {
    expect(ruleCondition(rule("MAX_DAILY_LOSS"), "USD")).toBe("Perdita fino a 1.000 USD al giorno");
    expect(ruleCondition(rule("MAX_DAILY_LOSS"), "EUR")).toBe("Nessuna soglia in EUR");
    expect(ruleCondition(rule("MAX_LOSS_PER_TRADE", { currencyLimits: [{ currency: "EUR", amount: "650.50" }] }), "EUR")).toBe(
      "Perdita fino a 650,50 EUR a trade",
    );
  });

  it("tolleranza espressa come uscita massima in R", () => {
    expect(ruleCondition(rule("STOP_RESPECTED"), "USD")).toBe("Uscita in perdita non oltre 1,1R dallo stop");
  });

  it("orario, pausa, posizioni, size", () => {
    expect(ruleCondition(rule("TRADING_HOURS"), "USD")).toBe("Asia (Tokyo) · Londra · New York, non nel weekend");
    expect(ruleCondition(rule("COOLDOWN_AFTER_LOSS"), "USD")).toBe("Pausa di 15 minuti dopo una perdita");
    expect(ruleCondition(rule("MAX_QUANTITY_PER_SYMBOL"), "USD")).toBe("Nessun simbolo con una soglia");
    expect(
      ruleCondition(rule("MAX_QUANTITY_PER_SYMBOL", { symbolLimits: [{ symbol: "ES", quantity: "2" }] }), "USD"),
    ).toBe("ES fino a 2");
  });
});

describe("mesi e date", () => {
  const e = (day: string) => ({ day }) as DayEvaluation;
  it("mesi distinti dal più recente", () => {
    expect(monthsNewestFirst([e("2026-06-02"), e("2026-07-01"), e("2026-06-30")])).toEqual(["2026-07", "2026-06"]);
  });
  it("etichette", () => {
    expect(monthLabel("2026-07")).toBe("Luglio 2026");
    expect(shortDay("2026-07-28")).toBe("28/07");
  });
});
