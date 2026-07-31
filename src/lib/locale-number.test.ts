import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "./locale-number";

describe("parseLocaleNumber (B-04)", () => {
  it('"50.000" it-IT è CINQUANTAMILA, non 50', () => {
    expect(parseLocaleNumber("50.000")).toBe(50000);
    expect(parseLocaleNumber("1.500")).toBe(1500);
    expect(parseLocaleNumber("2.000.000")).toBe(2000000);
  });

  it("virgola decimale italiana, con e senza migliaia", () => {
    expect(parseLocaleNumber("1,5")).toBe(1.5);
    expect(parseLocaleNumber("0,25")).toBe(0.25);
    expect(parseLocaleNumber("1.234,56")).toBe(1234.56);
    expect(parseLocaleNumber("50.000,75")).toBe(50000.75);
  });

  it("punto decimale quando NON è un pattern di raggruppamento", () => {
    expect(parseLocaleNumber("50.5")).toBe(50.5);
    expect(parseLocaleNumber("1.5000")).toBe(1.5);
    expect(parseLocaleNumber("0.25")).toBe(0.25);
  });

  it("interi e spazi ai bordi", () => {
    expect(parseLocaleNumber("50000")).toBe(50000);
    expect(parseLocaleNumber(" 42 ")).toBe(42);
  });

  it("input ambigui o vuoti → NaN, mai un numero plausibile", () => {
    expect(parseLocaleNumber("1,234,5")).toBeNaN();
    expect(parseLocaleNumber("")).toBeNaN();
    expect(parseLocaleNumber("abc")).toBeNaN();
  });
});
