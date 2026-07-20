import { describe, expect, it } from "vitest";
import { tradeInputSchema } from "./trade";

const baseInput = {
  tradingAccountId: "acc_1",
  symbol: "es",
  assetClass: "FUTURES" as const,
  executions: [
    {
      side: "BUY" as const,
      quantity: "2",
      price: "5000.25",
      fee: "4.20",
      executedAt: "2026-07-15T09:00",
    },
  ],
};

describe("tradeInputSchema", () => {
  it("normalizza simbolo in maiuscolo e virgole decimali in punti", () => {
    const parsed = tradeInputSchema.parse({
      ...baseInput,
      initialRisk: "250,50",
      executions: [{ ...baseInput.executions[0], price: "5000,25" }],
    });
    expect(parsed.symbol).toBe("ES");
    expect(parsed.initialRisk).toBe("250.50");
    expect(parsed.executions[0].price).toBe("5000.25");
  });

  it("converte strategyId vuoto in undefined (regressione FK violation)", () => {
    const parsed = tradeInputSchema.parse({ ...baseInput, strategyId: "" });
    expect(parsed.strategyId).toBeUndefined();
  });

  it("converte i campi opzionali vuoti in undefined", () => {
    const parsed = tradeInputSchema.parse({
      ...baseInput,
      initialRisk: "",
      plannedStop: "",
      plannedTarget: "",
    });
    expect(parsed.initialRisk).toBeUndefined();
    expect(parsed.plannedStop).toBeUndefined();
    expect(parsed.plannedTarget).toBeUndefined();
  });

  it("applica i default: pointValue 1, tags []", () => {
    const parsed = tradeInputSchema.parse(baseInput);
    expect(parsed.pointValue).toBe("1");
    expect(parsed.tags).toEqual([]);
  });

  it("rifiuta un trade senza esecuzioni", () => {
    expect(() =>
      tradeInputSchema.parse({ ...baseInput, executions: [] }),
    ).toThrow();
  });

  it("rifiuta datetime malformati", () => {
    expect(() =>
      tradeInputSchema.parse({
        ...baseInput,
        executions: [
          { ...baseInput.executions[0], executedAt: "15/07/2026 09:00" },
        ],
      }),
    ).toThrow();
  });

  it("rifiuta date di calendario inesistenti (31 febbraio)", () => {
    expect(() =>
      tradeInputSchema.parse({
        ...baseInput,
        executions: [
          { ...baseInput.executions[0], executedAt: "2026-02-31T09:00" },
        ],
      }),
    ).toThrow(/inesistente/);
  });
});
