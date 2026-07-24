import { describe, expect, it } from "vitest";
import { resolveCurrencyScope } from "./currency-scope";

const t = (currency: string, trades: number, netPnl = "0") => ({
  currency,
  trades,
  netPnl,
});

describe("resolveCurrencyScope", () => {
  it("nessuna valuta (zero trade) → active undefined, non multi", () => {
    const s = resolveCurrencyScope([]);
    expect(s.active).toBeUndefined();
    expect(s.multi).toBe(false);
  });

  it("una sola valuta → scope su quella, non multi", () => {
    const s = resolveCurrencyScope([t("USD", 200)]);
    expect(s.active).toBe("USD");
    expect(s.multi).toBe(false);
  });

  it("più valute senza cur → prevalente (più trade), multi", () => {
    const s = resolveCurrencyScope([t("USD", 150), t("EUR", 63)]);
    expect(s.active).toBe("USD");
    expect(s.multi).toBe(true);
  });

  it("più valute con cur valido → quella scelta", () => {
    const s = resolveCurrencyScope([t("USD", 150), t("EUR", 63)], "EUR");
    expect(s.active).toBe("EUR");
    expect(s.multi).toBe(true);
  });

  it("più valute con cur non valido → prevalente", () => {
    const s = resolveCurrencyScope([t("USD", 150), t("EUR", 63)], "GBP");
    expect(s.active).toBe("USD");
    expect(s.multi).toBe(true);
  });
});
