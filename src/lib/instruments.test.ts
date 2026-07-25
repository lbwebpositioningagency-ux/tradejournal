import { describe, expect, it } from "vitest";
import { formatPrice, priceDecimals, suggestPointValue } from "./instruments";

describe("priceDecimals", () => {
  it("forex major/minor: 5 decimali", () => {
    expect(priceDecimals("EURUSD", "FOREX")).toBe(5);
    expect(priceDecimals("GBPUSD", "FOREX")).toBe(5);
  });

  it("coppie JPY: 3 decimali", () => {
    expect(priceDecimals("USDJPY", "FOREX")).toBe(3);
    expect(priceDecimals("EURJPY", "FOREX")).toBe(3);
  });

  it("metalli quotati come forex (XAU/XAG): 2 decimali", () => {
    expect(priceDecimals("XAUUSD", "FOREX")).toBe(2);
    expect(priceDecimals("XAGUSD", "FOREX")).toBe(2);
  });

  it("futures/indici/azioni/crypto/opzioni: 2 decimali", () => {
    expect(priceDecimals("ES", "FUTURES")).toBe(2);
    expect(priceDecimals("NQ", "FUTURES")).toBe(2);
    expect(priceDecimals("AAPL", "STOCK")).toBe(2);
    expect(priceDecimals("BTCUSD", "CRYPTO")).toBe(2);
  });
});

describe("formatPrice", () => {
  it("forex a 5 decimali con virgola it-IT", () => {
    expect(formatPrice("1.08542", "EURUSD", "FOREX")).toBe("1,08542");
    // mantiene gli zeri finali significativi per il forex
    expect(formatPrice("1.1", "EURUSD", "FOREX")).toBe("1,10000");
  });

  it("oro (XAUUSD) a 2 decimali, virgola it-IT", () => {
    // it-IT (CLDR) non raggruppa le migliaia sotto le 5 cifre intere.
    expect(formatPrice("2717.45", "XAUUSD", "FOREX")).toBe("2717,45");
    expect(formatPrice("12345.6", "XAUUSD", "FOREX")).toBe("12.345,60");
  });

  it("futures a 2 decimali", () => {
    expect(formatPrice("5325.25", "ES", "FUTURES")).toBe("5325,25");
  });

  it("trattino per valore mancante o non numerico", () => {
    expect(formatPrice(null, "ES", "FUTURES")).toBe("—");
    expect(formatPrice("", "ES", "FUTURES")).toBe("—");
    expect(formatPrice("abc", "ES", "FUTURES")).toBe("—");
  });
});

describe("suggestPointValue (F13)", () => {
  it("futures noti dalla tabella", () => {
    expect(suggestPointValue("ES", "FUTURES")).toBe("50");
    expect(suggestPointValue("mnq", "FUTURES")).toBe("2");
    expect(suggestPointValue("CL", "FUTURES")).toBe("1000");
  });

  it("metalli spot anche come FOREX", () => {
    expect(suggestPointValue("XAUUSD", "FOREX")).toBe("100");
    expect(suggestPointValue("XAGUSD", "FOREX")).toBe("5000");
  });

  it("coppia forex a 6 lettere: lotto standard", () => {
    expect(suggestPointValue("EURUSD", "FOREX")).toBe("100000");
    expect(suggestPointValue("GBPJPY", "FOREX")).toBe("100000");
  });

  it("sconosciuti o asset diversi: null (mai un default inventato)", () => {
    expect(suggestPointValue("AAPL", "STOCK")).toBeNull();
    expect(suggestPointValue("PIPPO", "FUTURES")).toBeNull();
    expect(suggestPointValue("EURUSD", "STOCK")).toBeNull();
    expect(suggestPointValue("", "FUTURES")).toBeNull();
  });
});
