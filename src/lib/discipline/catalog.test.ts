import { describe, expect, it } from "vitest";
import { DisciplineRuleType as PrismaRuleType } from "@/generated/prisma/enums";
import {
  DISCIPLINE_RULE_TYPES,
  RULE_CATALOG,
  RULE_DEFAULTS,
  effectiveRules,
} from "./catalog";
import { disciplineRuleSchema } from "@/lib/validations/discipline";

describe("catalogo delle regole", () => {
  it("ricalca esattamente l'enum Prisma", () => {
    expect([...DISCIPLINE_RULE_TYPES].sort()).toEqual(Object.values(PrismaRuleType).sort());
  });

  it("attive di default: le cinque decise il 16/09/2026, e solo quelle", () => {
    const attive = DISCIPLINE_RULE_TYPES.filter((t) => RULE_DEFAULTS[t].isActive);
    expect(attive).toEqual([
      "STOP_PRESENT",
      "STOP_RESPECTED",
      "MAX_LOSS_PER_TRADE",
      "MAX_DAILY_LOSS",
      "MAX_TRADES_PER_DAY",
    ]);
  });

  it("soglie di partenza decise", () => {
    expect(RULE_DEFAULTS.STOP_RESPECTED.rValue).toBe("0.1");
    expect(RULE_DEFAULTS.MAX_LOSS_PER_TRADE.currencyLimits).toEqual([{ currency: "USD", amount: "700.00" }]);
    expect(RULE_DEFAULTS.MAX_DAILY_LOSS.currencyLimits).toEqual([{ currency: "USD", amount: "1000.00" }]);
    expect(RULE_DEFAULTS.MAX_TRADES_PER_DAY.countValue).toBe(5);
    expect(RULE_DEFAULTS.MAX_PLANNED_RISK.currencyLimits).toEqual([{ currency: "USD", amount: "500.00" }]);
    expect(RULE_DEFAULTS.MIN_TARGET_R.rValue).toBe("1");
    expect(RULE_DEFAULTS.TRADING_HOURS.sessions).toEqual(["ASIA", "LONDON", "NEWYORK"]);
    expect(RULE_DEFAULTS.TRADING_HOURS.allowWeekend).toBe(false);
    expect(RULE_DEFAULTS.COOLDOWN_AFTER_LOSS.minutesValue).toBe(15);
  });

  it("giornata di attribuzione: apertura per trade al giorno e pausa, chiusura per le perdite", () => {
    expect(RULE_CATALOG.MAX_TRADES_PER_DAY.dayBasis).toBe("OPEN");
    expect(RULE_CATALOG.COOLDOWN_AFTER_LOSS.dayBasis).toBe("OPEN");
    expect(RULE_CATALOG.STOP_RESPECTED.dayBasis).toBe("CLOSE");
    expect(RULE_CATALOG.MAX_LOSS_PER_TRADE.dayBasis).toBe("CLOSE");
    expect(RULE_CATALOG.MAX_DAILY_LOSS.dayBasis).toBe("CLOSE");
  });

  it("i valori di partenza passano la validazione della form", () => {
    for (const type of DISCIPLINE_RULE_TYPES) {
      if (type === "MAX_QUANTITY_PER_SYMBOL") continue; // nessun simbolo di partenza, valida anche vuota
      const parsed = disciplineRuleSchema.safeParse({ type, ...RULE_DEFAULTS[type] });
      expect(parsed.success, type).toBe(true);
    }
  });

  it("stop presente segnala l'import MT5 senza stop", () => {
    expect(RULE_CATALOG.STOP_PRESENT.note).toMatch(/MT5/);
  });
});

describe("effectiveRules", () => {
  it("senza righe salvate valgono i valori di partenza", () => {
    const rules = effectiveRules([]);
    expect(rules).toHaveLength(12);
    expect(rules.every((r) => !r.customized)).toBe(true);
  });

  it("la riga salvata sostituisce il default e scarta sessioni sconosciute", () => {
    const rules = effectiveRules([
      {
        type: "TRADING_HOURS",
        isActive: true,
        rValue: null,
        countValue: null,
        minutesValue: null,
        sessions: ["LONDON", "MARTE"],
        allowWeekend: true,
        currencyLimits: [],
        symbolLimits: [],
      },
    ]);
    const hours = rules.find((r) => r.type === "TRADING_HOURS")!;
    expect(hours).toMatchObject({ customized: true, isActive: true, sessions: ["LONDON"], allowWeekend: true });
  });
});

describe("validazione della regola", () => {
  const baseInput = {
    isActive: true,
    rValue: null,
    countValue: null,
    minutesValue: null,
    sessions: [],
    allowWeekend: false,
    currencyLimits: [],
    symbolLimits: [],
  };

  it("accetta la virgola e normalizza, azzera i parametri non usati", () => {
    const parsed = disciplineRuleSchema.parse({
      ...baseInput,
      type: "MAX_DAILY_LOSS",
      countValue: 4,
      currencyLimits: [{ currency: "eur", amount: "850,50" }],
    });
    expect(parsed.currencyLimits).toEqual([{ currency: "EUR", amount: "850.50" }]);
    expect(parsed.countValue).toBeNull();
  });

  it("rifiuta due soglie nella stessa valuta", () => {
    const parsed = disciplineRuleSchema.safeParse({
      ...baseInput,
      type: "MAX_DAILY_LOSS",
      currencyLimits: [
        { currency: "USD", amount: "100" },
        { currency: "usd", amount: "200" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("tolleranza zero ammessa, R/R minimo zero no", () => {
    expect(disciplineRuleSchema.safeParse({ ...baseInput, type: "STOP_RESPECTED", rValue: "0" }).success).toBe(true);
    expect(disciplineRuleSchema.safeParse({ ...baseInput, type: "MIN_TARGET_R", rValue: "0" }).success).toBe(false);
  });

  it("orario operativo senza sessioni non è una regola", () => {
    expect(disciplineRuleSchema.safeParse({ ...baseInput, type: "TRADING_HOURS" }).success).toBe(false);
  });

  it("numero intero obbligatorio per i massimi", () => {
    expect(disciplineRuleSchema.safeParse({ ...baseInput, type: "MAX_TRADES_PER_DAY" }).success).toBe(false);
    expect(disciplineRuleSchema.safeParse({ ...baseInput, type: "MAX_TRADES_PER_DAY", countValue: 0 }).success).toBe(false);
  });
});
