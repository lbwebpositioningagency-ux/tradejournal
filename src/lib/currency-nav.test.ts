import { describe, expect, it } from "vitest";
import {
  accountCurrencyTotals,
  currencyTotalsFromAccounts,
  reviewBalanceLines,
  statsByCurrency,
  withCurrencyParam,
} from "./currency-nav";
import { resolveCurrencyScope } from "./currency-scope";

describe("withCurrencyParam — la valuta scelta non si perde nei link", () => {
  it("aggiunge cur a un href senza query", () => {
    expect(withCurrencyParam("/day/2026-07-21", "EUR")).toBe("/day/2026-07-21?cur=EUR");
  });

  it("conserva la query esistente e l'ancora", () => {
    expect(withCurrencyParam("/day?month=2026-07#top", "EUR")).toBe(
      "/day?month=2026-07&cur=EUR#top",
    );
  });

  it("sostituisce un cur già presente invece di duplicarlo", () => {
    expect(withCurrencyParam("/trades?cur=USD&risk=missing", "EUR")).toBe(
      "/trades?cur=EUR&risk=missing",
    );
  });

  it("senza valuta l'href resta identico", () => {
    expect(withCurrencyParam("/day/2026-07-21", undefined)).toBe("/day/2026-07-21");
    expect(withCurrencyParam("/day/2026-07-21", null)).toBe("/day/2026-07-21");
  });
});

describe("statsByCurrency / reviewBalanceLines — mai 100 USD + 100 EUR", () => {
  const giornoMisto = [
    { netPnl: "100.00", currency: "USD" },
    { netPnl: "-40.00", currency: "USD" },
    { netPnl: "100.00", currency: "EUR" },
  ];

  it("le statistiche restano separate per valuta", () => {
    const g = statsByCurrency(giornoMisto);
    expect(g).toEqual([
      { currency: "USD", trades: 2, wins: 1, losses: 1, net: "60.00", winSum: "100.00", lossSum: "-40.00" },
      { currency: "EUR", trades: 1, wins: 1, losses: 0, net: "100.00", winSum: "100.00", lossSum: "0.00" },
    ]);
  });

  it("il bilancio del Post-Market ha una riga per valuta e nessun totale comune", () => {
    const righe = reviewBalanceLines(giornoMisto);
    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatch(/^Bilancio USD: /);
    expect(righe[1]).toMatch(/^Bilancio EUR: /);
    // Il vecchio template scriveva «+160» con la valuta del primo trade.
    expect(righe.join("\n")).not.toMatch(/160/);
  });

  it("con una valuta sola la riga resta «Bilancio», come prima", () => {
    const righe = reviewBalanceLines([{ netPnl: "10.00", currency: "USD" }]);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatch(/^Bilancio: /);
  });

  it("zero trade → nessuna riga", () => {
    expect(reviewBalanceLines([])).toEqual([]);
  });
});

describe("valute di riserva — il saldo di un conto senza trade", () => {
  it("dai conti: una valuta per riga, la più frequente prima", () => {
    const totals = accountCurrencyTotals([
      { currency: "EUR" },
      { currency: "USD" },
      { currency: "USD" },
    ]);
    expect(totals.map((t) => t.currency)).toEqual(["USD", "EUR"]);
    // Lo scope che ne esce ha SEMPRE una valuta: getStartingBalance filtra.
    const scope = resolveCurrencyScope(totals, undefined);
    expect(scope.active).toBe("USD");
    expect(scope.multi).toBe(true);
    expect(resolveCurrencyScope(totals, "EUR").active).toBe("EUR");
  });

  it("dai conteggi per conto: valute senza trade escluse, somma per valuta", () => {
    const totals = currencyTotalsFromAccounts([
      { currency: "EUR", trades: 91 },
      { currency: "USD", trades: 124 },
      { currency: "USD", trades: 0 },
      { currency: "GBP", trades: 0 },
    ]);
    expect(totals).toEqual([
      { currency: "USD", netPnl: "0", trades: 124 },
      { currency: "EUR", netPnl: "0", trades: 91 },
    ]);
  });
});
