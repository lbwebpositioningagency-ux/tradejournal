import { describe, expect, it } from "vitest";
import { rowFingerprint, tradeFingerprint } from "./import-core";
import type { TradeInput } from "@/lib/validations/trade";

/**
 * F14 — solo le funzioni PURE del fingerprint (la persistenza è coperta dai
 * test di integrazione della pipeline).
 */

const ROME = "Europe/Rome";

function input(overrides: Partial<TradeInput> = {}): TradeInput {
  return {
    tradingAccountId: "acc_1",
    symbol: "ES",
    assetClass: "FUTURES",
    pointValue: "50",
    tags: [],
    executions: [
      {
        side: "BUY",
        quantity: "2",
        price: "5000.25",
        fee: "8.40",
        executedAt: "2026-07-15T09:30",
      },
      {
        side: "SELL",
        quantity: "2",
        price: "5010.25",
        fee: "0",
        executedAt: "2026-07-15T10:15",
      },
    ],
    ...overrides,
  };
}

describe("rowFingerprint / tradeFingerprint (F14)", () => {
  it("riga CSV e trade salvato equivalente hanno lo stesso fingerprint", () => {
    // 09:30 Roma (estate) = 07:30 UTC — come lo salverebbe la pipeline.
    const fromDb = tradeFingerprint({
      symbol: "ES",
      openedAt: new Date("2026-07-15T07:30:00.000Z"),
      closedAt: new Date("2026-07-15T08:15:00.000Z"),
      quantity: "2.00000000", // Decimal(18,8) dal database
      avgEntryPrice: "5000.25000000",
      avgExitPrice: "5010.25000000",
    });
    expect(rowFingerprint(input(), ROME)).toBe(fromDb);
  });

  it("normalizzazione decimale: '2' ≡ '2.00000000'", () => {
    const a = rowFingerprint(input(), ROME);
    const b = rowFingerprint(
      input({
        executions: [
          { side: "BUY", quantity: "2.0", price: "5000.250", fee: "1", executedAt: "2026-07-15T09:30" },
          { side: "SELL", quantity: "2.0", price: "5010.2500", fee: "0", executedAt: "2026-07-15T10:15" },
        ],
      }),
      ROME,
    );
    // La fee NON fa parte della chiave: stesso trade, broker diversi sui costi.
    expect(a).toBe(b);
  });

  it("simbolo case-insensitive", () => {
    expect(rowFingerprint(input({ symbol: "es" }), ROME)).toBe(
      rowFingerprint(input({ symbol: "ES" }), ROME),
    );
  });

  it("prezzi, quantità o orari diversi → fingerprint diversi", () => {
    const base = rowFingerprint(input(), ROME);
    expect(
      rowFingerprint(
        input({
          executions: [
            { side: "BUY", quantity: "3", price: "5000.25", fee: "0", executedAt: "2026-07-15T09:30" },
            { side: "SELL", quantity: "3", price: "5010.25", fee: "0", executedAt: "2026-07-15T10:15" },
          ],
        }),
        ROME,
      ),
    ).not.toBe(base);
    expect(
      rowFingerprint(
        input({
          executions: [
            { side: "BUY", quantity: "2", price: "5000.25", fee: "0", executedAt: "2026-07-15T09:31" },
            { side: "SELL", quantity: "2", price: "5010.25", fee: "0", executedAt: "2026-07-15T10:15" },
          ],
        }),
        ROME,
      ),
    ).not.toBe(base);
  });

  it("trade aperto: chiusura vuota nella chiave, mai uguale a uno chiuso", () => {
    const open = rowFingerprint(
      input({
        executions: [
          { side: "BUY", quantity: "2", price: "5000.25", fee: "0", executedAt: "2026-07-15T09:30" },
        ],
      }),
      ROME,
    );
    expect(open).not.toBeNull();
    expect(open).not.toBe(rowFingerprint(input(), ROME));
  });

  it("data non convertibile → null (la pipeline darà l'errore giusto)", () => {
    expect(
      rowFingerprint(
        input({
          executions: [
            { side: "BUY", quantity: "2", price: "5000.25", fee: "0", executedAt: "2026-02-31T09:30" },
          ],
        }),
        ROME,
      ),
    ).toBeNull();
  });

  it("il fuso conta: stessa ora locale in fusi diversi → chiavi diverse", () => {
    expect(rowFingerprint(input(), ROME)).not.toBe(
      rowFingerprint(input(), "America/New_York"),
    );
  });
});
