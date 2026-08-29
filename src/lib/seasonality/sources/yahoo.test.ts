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

/* ─── Ultima barra non consolidata (caso reale del 28/08/2026) ─────────────
   Yahoo lascia l'ultima barra con `close` nullo per ore dopo la chiusura,
   mentre `meta.regularMarketPrice` porta già la chiusura vera. Era la causa
   del ritardo di una seduta su TUTTE le serie Yahoo del desk. */

/** 2024-01-03: apertura 14:30 UTC, chiusura di seduta 21:00 UTC. */
const APERTURA_2 = 1704272400;
const FINE_SEDUTA = 1704315600; // 2024-01-03T21:00:00Z
const DOPO_LA_CHIUSURA = new Date("2024-01-03T22:00:00Z");
const SEDUTA_APERTA = new Date("2024-01-03T18:00:00Z");

const nonConsolidata = (metaOver: Record<string, unknown> = {}) =>
  risposta({
    indicators: { quote: [{ close: [100, null] }] },
    meta: {
      dataGranularity: "1d",
      regularMarketPrice: 110,
      regularMarketTime: FINE_SEDUTA,
      currentTradingPeriod: { regular: { start: APERTURA_2, end: FINE_SEDUTA } },
      ...metaOver,
    },
  });

describe("parseYahooChart — ultima barra non consolidata", () => {
  it("a seduta CHIUSA ripesca la chiusura da meta.regularMarketPrice", () => {
    expect(parseYahooChart(nonConsolidata(), DOPO_LA_CHIUSURA)).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 110 },
    ]);
  });

  it("a seduta APERTA non ripesca nulla: quello è un prezzo vivo, non una chiusura", () => {
    expect(parseYahooChart(nonConsolidata(), SEDUTA_APERTA)).toEqual([
      { date: "2024-01-02", close: 100 },
    ]);
  });

  it("non ripesca se il prezzo di meta è di un ALTRO giorno", () => {
    const out = parseYahooChart(
      nonConsolidata({ regularMarketTime: FINE_SEDUTA + 86_400 }),
      new Date("2024-01-04T22:00:00Z"),
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("non ripesca senza currentTradingPeriod: la fine seduta non è verificabile", () => {
    const out = parseYahooChart(
      nonConsolidata({ currentTradingPeriod: undefined }),
      DOPO_LA_CHIUSURA,
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("non ripesca su un prezzo non positivo o non finito", () => {
    for (const price of [0, -1, Number.NaN, "110"]) {
      const out = parseYahooChart(
        nonConsolidata({ regularMarketPrice: price }),
        DOPO_LA_CHIUSURA,
      );
      expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
    }
  });

  it("un buco IN MEZZO alla serie resta un dato mancante, mai ripescato", () => {
    const out = parseYahooChart(
      {
        chart: {
          result: [
            {
              meta: {
                dataGranularity: "1d",
                regularMarketPrice: 110,
                regularMarketTime: FINE_SEDUTA,
                currentTradingPeriod: {
                  regular: { start: APERTURA_2, end: FINE_SEDUTA },
                },
              },
              timestamp: [1704186000, APERTURA_2, 1704358800],
              indicators: { quote: [{ close: [100, null, 120] }] },
            },
          ],
        },
      },
      new Date("2024-01-04T22:00:00Z"),
    );
    expect(out).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-04", close: 120 },
    ]);
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
