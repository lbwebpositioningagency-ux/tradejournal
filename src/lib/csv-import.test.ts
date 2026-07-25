import { describe, expect, it } from "vitest";
import {
  buildTradeInput,
  guessMapping,
  normalizeDecimal,
  parseCsvDateTime,
  parseDirection,
  previewNetPnl,
  type ImportMapping,
  type ImportOptions,
} from "./csv-import";

describe("normalizeDecimal", () => {
  it("accetta numeri già normalizzati", () => {
    expect(normalizeDecimal("5000.25")).toBe("5000.25");
    expect(normalizeDecimal("2")).toBe("2");
    expect(normalizeDecimal("-150.5")).toBe("-150.5");
  });

  it("converte la virgola decimale", () => {
    expect(normalizeDecimal("4,20")).toBe("4.20");
    expect(normalizeDecimal("0,5")).toBe("0.5");
  });

  it("gestisce i separatori delle migliaia (stile EU e US)", () => {
    expect(normalizeDecimal("1.234,56")).toBe("1234.56");
    expect(normalizeDecimal("1,234.56")).toBe("1234.56");
    expect(normalizeDecimal("1.234.567")).toBe("1234567");
    expect(normalizeDecimal("1,234")).toBe("1234");
  });

  it("ignora simboli di valuta e spazi", () => {
    expect(normalizeDecimal("$ 4.20")).toBe("4.20");
    expect(normalizeDecimal("1 234,56 €")).toBe("1234.56");
  });

  it("restituisce null per input non numerici", () => {
    expect(normalizeDecimal("")).toBeNull();
    expect(normalizeDecimal("abc")).toBeNull();
    expect(normalizeDecimal("-")).toBeNull();
  });
});

describe("parseCsvDateTime", () => {
  it("formato ISO, con e senza secondi e con T", () => {
    expect(parseCsvDateTime("2026-07-15 09:30", "iso")).toBe("2026-07-15T09:30");
    expect(parseCsvDateTime("2026-07-15T09:30:45", "iso")).toBe("2026-07-15T09:30:45");
  });

  it("formato europeo con separatori diversi", () => {
    expect(parseCsvDateTime("15/07/2026 09:30", "eu")).toBe("2026-07-15T09:30");
    expect(parseCsvDateTime("15.07.2026 09:30", "eu")).toBe("2026-07-15T09:30");
    expect(parseCsvDateTime("15-07-2026 09:30:15", "eu")).toBe("2026-07-15T09:30:15");
  });

  it("formato USA con AM/PM", () => {
    expect(parseCsvDateTime("07/15/2026 9:30 AM", "us")).toBe("2026-07-15T09:30");
    expect(parseCsvDateTime("07/15/2026 2:05 PM", "us")).toBe("2026-07-15T14:05");
    expect(parseCsvDateTime("07/15/2026 12:00 AM", "us")).toBe("2026-07-15T00:00");
    expect(parseCsvDateTime("07/15/2026 12:00 PM", "us")).toBe("2026-07-15T12:00");
  });

  it("ora mancante → mezzanotte", () => {
    expect(parseCsvDateTime("15/07/2026", "eu")).toBe("2026-07-15T00:00");
    expect(parseCsvDateTime("2026-07-15", "iso")).toBe("2026-07-15T00:00");
  });

  it("restituisce null per date non valide", () => {
    expect(parseCsvDateTime("", "iso")).toBeNull();
    expect(parseCsvDateTime("15/07/2026", "iso")).toBeNull();
    expect(parseCsvDateTime("32/07/2026", "eu")).toBeNull();
    expect(parseCsvDateTime("15/13/2026", "eu")).toBeNull();
  });

  it("rifiuta date di calendario inesistenti (niente rollover JS)", () => {
    expect(parseCsvDateTime("31/02/2026", "eu")).toBeNull(); // 31 febbraio
    expect(parseCsvDateTime("31/04/2026", "eu")).toBeNull(); // aprile ha 30 giorni
    expect(parseCsvDateTime("29/02/2027", "eu")).toBeNull(); // 2027 non bisestile
    expect(parseCsvDateTime("2026-02-31", "iso")).toBeNull();
  });

  it("accetta il 29 febbraio negli anni bisestili", () => {
    expect(parseCsvDateTime("29/02/2028", "eu")).toBe("2028-02-29T00:00");
    expect(parseCsvDateTime("29/02/2000", "eu")).toBe("2000-02-29T00:00"); // ÷400
  });
});

describe("parseDirection", () => {
  it("riconosce le varianti comuni", () => {
    expect(parseDirection("long")).toBe("LONG");
    expect(parseDirection("BUY")).toBe("LONG");
    expect(parseDirection("b")).toBe("LONG");
    expect(parseDirection("Short")).toBe("SHORT");
    expect(parseDirection("SELL")).toBe("SHORT");
    expect(parseDirection("s")).toBe("SHORT");
  });

  it("restituisce null per valori sconosciuti", () => {
    expect(parseDirection("hold")).toBeNull();
    expect(parseDirection("")).toBeNull();
  });
});

const mapping: ImportMapping = {
  columns: {
    symbol: "Symbol",
    direction: "Side",
    quantity: "Qty",
    entryPrice: "Entry Price",
    exitPrice: "Exit Price",
    entryAt: "Entry Time",
    exitAt: "Exit Time",
    fee: "Fee",
  },
  dateFormat: "eu",
};

const options: ImportOptions = {
  tradingAccountId: "acc_1",
  assetClass: "FUTURES",
  pointValue: "50",
};

const validRow = {
  Symbol: "ES",
  Side: "long",
  Qty: "2",
  "Entry Price": "5000,25",
  "Exit Price": "5010.25",
  "Entry Time": "15/07/2026 09:30",
  "Exit Time": "15/07/2026 10:15",
  Fee: "8,40",
};

describe("buildTradeInput", () => {
  it("costruisce un trade chiuso con 2 executions", () => {
    const result = buildTradeInput(validRow, mapping, options);
    if (!result.ok) throw new Error(result.error);
    expect(result.input.symbol).toBe("ES");
    expect(result.input.executions).toHaveLength(2);
    expect(result.input.executions[0]).toEqual({
      side: "BUY",
      quantity: "2",
      price: "5000.25",
      fee: "8.40",
      executedAt: "2026-07-15T09:30",
    });
    expect(result.input.executions[1]).toEqual({
      side: "SELL",
      quantity: "2",
      price: "5010.25",
      fee: "0",
      executedAt: "2026-07-15T10:15",
    });
  });

  it("uno short parte con SELL e chiude con BUY", () => {
    const result = buildTradeInput({ ...validRow, Side: "sell" }, mapping, options);
    if (!result.ok) throw new Error(result.error);
    expect(result.input.executions[0].side).toBe("SELL");
    expect(result.input.executions[1].side).toBe("BUY");
  });

  it("riga senza uscita → trade aperto con 1 execution", () => {
    const result = buildTradeInput(
      { ...validRow, "Exit Price": "", "Exit Time": "" },
      mapping,
      options,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.input.executions).toHaveLength(1);
  });

  it("uscita incompleta (solo prezzo o solo data) → errore", () => {
    const noTime = buildTradeInput({ ...validRow, "Exit Time": "" }, mapping, options);
    expect(noTime.ok).toBe(false);
    const noPrice = buildTradeInput({ ...validRow, "Exit Price": "" }, mapping, options);
    expect(noPrice.ok).toBe(false);
  });

  it("valori obbligatori mancanti o invalidi → errore parlante", () => {
    const noSymbol = buildTradeInput({ ...validRow, Symbol: "" }, mapping, options);
    expect(noSymbol.ok).toBe(false);
    if (!noSymbol.ok) expect(noSymbol.error).toContain("Simbolo");

    const badQty = buildTradeInput({ ...validRow, Qty: "abc" }, mapping, options);
    expect(badQty.ok).toBe(false);

    const badDate = buildTradeInput(
      { ...validRow, "Entry Time": "domani" },
      mapping,
      options,
    );
    expect(badDate.ok).toBe(false);

    const badDirection = buildTradeInput({ ...validRow, Side: "hold" }, mapping, options);
    expect(badDirection.ok).toBe(false);
  });

  it("uscita datata prima dell'ingresso → errore, non trade invertito", () => {
    const result = buildTradeInput(
      {
        ...validRow,
        "Entry Time": "15/07/2026 10:15",
        "Exit Time": "15/07/2026 09:30",
      },
      mapping,
      options,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("precedente all'ingresso");
  });

  it("colonna obbligatoria non mappata → errore", () => {
    const result = buildTradeInput(validRow, { ...mapping, columns: { ...mapping.columns, quantity: undefined } }, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non mappata");
  });
});

describe("guessMapping", () => {
  it("riconosce header comuni in inglese", () => {
    const guessed = guessMapping([
      "Symbol",
      "Side",
      "Qty",
      "Entry Price",
      "Exit Price",
      "Entry Time",
      "Exit Time",
      "Commission",
    ]);
    expect(guessed.symbol).toBe("Symbol");
    expect(guessed.direction).toBe("Side");
    expect(guessed.quantity).toBe("Qty");
    expect(guessed.entryPrice).toBe("Entry Price");
    expect(guessed.exitPrice).toBe("Exit Price");
    expect(guessed.entryAt).toBe("Entry Time");
    expect(guessed.exitAt).toBe("Exit Time");
    expect(guessed.fee).toBe("Commission");
  });

  it("riconosce header in italiano", () => {
    const guessed = guessMapping([
      "Simbolo",
      "Direzione",
      "Quantità",
      "Prezzo ingresso",
      "Prezzo uscita",
      "Data ingresso",
      "Data uscita",
    ]);
    expect(guessed.symbol).toBe("Simbolo");
    expect(guessed.direction).toBe("Direzione");
    expect(guessed.quantity).toBe("Quantità");
    expect(guessed.entryPrice).toBe("Prezzo ingresso");
    expect(guessed.exitPrice).toBe("Prezzo uscita");
    expect(guessed.entryAt).toBe("Data ingresso");
    expect(guessed.exitAt).toBe("Data uscita");
  });

  it("non mappa header sconosciuti", () => {
    const guessed = guessMapping(["Foo", "Bar"]);
    expect(Object.keys(guessed)).toHaveLength(0);
  });
});

describe("valore punto per riga (F13)", () => {
  it("simbolo noto: usa la tabella, non l'opzione file", () => {
    const nq = buildTradeInput({ ...validRow, Symbol: "NQ" }, mapping, options);
    if (!nq.ok) throw new Error(nq.error);
    expect(nq.input.pointValue).toBe("20");
    const gc = buildTradeInput({ ...validRow, Symbol: "GC" }, mapping, options);
    if (!gc.ok) throw new Error(gc.error);
    expect(gc.input.pointValue).toBe("100");
  });

  it("simbolo sconosciuto: fallback sull'opzione file", () => {
    const r = buildTradeInput({ ...validRow, Symbol: "PIPPO" }, mapping, options);
    if (!r.ok) throw new Error(r.error);
    expect(r.input.pointValue).toBe("50");
  });

  it("coppia forex standard: lotto 100000", () => {
    const r = buildTradeInput(
      { ...validRow, Symbol: "EURUSD" },
      mapping,
      { ...options, assetClass: "FOREX" },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.input.pointValue).toBe("100000");
  });
});

describe("previewNetPnl (F13)", () => {
  it("long chiuso: (uscita − ingresso) × qty × punto − fee", () => {
    const r = buildTradeInput(validRow, mapping, options);
    if (!r.ok) throw new Error(r.error);
    // ES: (5010.25 − 5000.25) × 2 × 50 − 8.40 = 991.60
    expect(previewNetPnl(r.input)).toBe("991.60");
  });

  it("short in perdita: segno corretto", () => {
    const r = buildTradeInput({ ...validRow, Side: "sell" }, mapping, options);
    if (!r.ok) throw new Error(r.error);
    // short da 5000.25 a 5010.25 = −10 pt × 2 × 50 − 8.40 = −1008.40
    expect(previewNetPnl(r.input)).toBe("-1008.40");
  });

  it("trade aperto: null, mai zero finto", () => {
    const r = buildTradeInput(
      { ...validRow, "Exit Price": "", "Exit Time": "" },
      mapping,
      options,
    );
    if (!r.ok) throw new Error(r.error);
    expect(previewNetPnl(r.input)).toBeNull();
  });
});
