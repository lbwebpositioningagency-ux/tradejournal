import { describe, expect, it } from "vitest";
import {
  parseYahooChart,
  parseYahooError,
  parseYahooGranularity,
  utcDateKey,
} from "@/lib/seasonality/sources/yahoo";

const risposta = (over: Record<string, unknown> = {}) => ({
  chart: {
    result: [
      {
        meta: { dataGranularity: "1d" },
        timestamp: [1704186000, 1704272400],
        indicators: { quote: [{ close: [100, 110] }] },
        ...over,
      },
    ],
  },
});

describe("utcDateKey", () => {
  it("usa la data civile UTC", () => {
    expect(utcDateKey(1704186000)).toBe("2024-01-02");
  });
});

describe("parseYahooChart", () => {
  it("estrae le barre valide", () => {
    expect(parseYahooChart(risposta())).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 110 },
    ]);
  });

  it("scarta le chiusure null (sospensioni: dato MANCANTE, non zero)", () => {
    const out = parseYahooChart(
      risposta({ indicators: { quote: [{ close: [null, 110] }] } }),
    );
    expect(out).toEqual([{ date: "2024-01-03", close: 110 }]);
  });

  it("scarta le chiusure non positive", () => {
    const out = parseYahooChart(
      risposta({ indicators: { quote: [{ close: [0, -3] }] } }),
    );
    expect(out).toEqual([]);
  });

  it("risposte malformate non fanno crashare il job", () => {
    expect(parseYahooChart(null)).toEqual([]);
    expect(parseYahooChart({})).toEqual([]);
    expect(parseYahooChart({ chart: { result: [] } })).toEqual([]);
    expect(parseYahooChart({ chart: { result: [{}] } })).toEqual([]);
    expect(parseYahooChart("<html>")).toEqual([]);
  });
});

describe("parseYahooGranularity", () => {
  it("legge la granularità dichiarata", () => {
    expect(parseYahooGranularity(risposta())).toBe("1d");
  });

  it("riconosce il declassamento silenzioso a trimestrale", () => {
    // È il caso reale di range=max: 168 barre "giornaliere" su 42 anni.
    expect(
      parseYahooGranularity(risposta({ meta: { dataGranularity: "3mo" } })),
    ).toBe("3mo");
  });

  it("assente o malformata → null (nessun crash)", () => {
    expect(parseYahooGranularity({ chart: { result: [{}] } })).toBeNull();
    expect(parseYahooGranularity(null)).toBeNull();
  });
});

describe("parseYahooError", () => {
  it("estrae la descrizione dell'errore", () => {
    expect(
      parseYahooError({
        chart: { error: { description: "No data found, symbol may be delisted" } },
      }),
    ).toBe("No data found, symbol may be delisted");
  });

  it("nessun errore → null", () => {
    expect(parseYahooError(risposta())).toBeNull();
  });
});
