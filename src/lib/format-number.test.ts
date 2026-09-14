import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { formatInteger, formatNumber, formatQuantity } from "./format-number";

describe("formatNumber — il formattatore unico", () => {
  it("virgola decimale e punto delle migliaia anche a quattro cifre", () => {
    // Il CLDR italiano scriverebbe «2753,00» sopra «20.777,50».
    expect(formatNumber("2753", { decimals: 2 })).toBe("2.753,00");
    expect(formatNumber("20777.5", { decimals: 2 })).toBe("20.777,50");
  });

  it("accetta stringhe decimali, numeri e Decimal", () => {
    expect(formatNumber("1.10234", { decimals: 5 })).toBe("1,10234");
    expect(formatNumber(0.5, { decimals: 1 })).toBe("0,5");
    expect(formatNumber(new Decimal("-260.24"), { decimals: 2 })).toBe("-260,24");
  });

  it("segno esplicito solo dove c'è un segno", () => {
    expect(formatNumber("12.4", { decimals: 2, sign: true })).toBe("+12,40");
    expect(formatNumber("-12.4", { decimals: 2, sign: true })).toBe("-12,40");
    expect(formatNumber("0", { decimals: 2, sign: true })).toBe("0,00");
  });

  it("valuta nel formato italiano", () => {
    expect(formatNumber("-260.24", { decimals: 2, sign: true, currency: "EUR" })).toBe(
      "-260,24 €",
    );
    expect(formatNumber("1234.5", { decimals: 2, currency: "USD" })).toBe("1.234,50 USD");
  });

  it("vuoto, non numerico, infinito → trattino, mai NaN", () => {
    for (const v of [null, undefined, "", "abc", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatNumber(v, { decimals: 2 })).toBe("—");
    }
  });

  it("decimali minimi e massimi", () => {
    expect(formatNumber("7.359", { maxDecimals: 3 })).toBe("7,359");
    expect(formatNumber("45", { maxDecimals: 3 })).toBe("45");
  });
});

describe("formatQuantity", () => {
  it("tutti i decimali significativi, nessuno zero finale", () => {
    expect(formatQuantity("0.99000000")).toBe("0,99");
    expect(formatQuantity("2.00000000")).toBe("2");
    expect(formatQuantity("100000")).toBe("100.000");
    expect(formatQuantity("0.00012345")).toBe("0,00012345");
  });
});

describe("formatInteger", () => {
  it("interi col punto delle migliaia", () => {
    expect(formatInteger(1234)).toBe("1.234");
    expect(formatInteger("215")).toBe("215");
  });
});
