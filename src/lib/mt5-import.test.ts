import { describe, expect, it } from "vitest";
import {
  mt5RecordSchema,
  mt5RecordToImportRow,
  parseMt5File,
  type Mt5Record,
} from "./mt5-import";

const VALID: Mt5Record = {
  v: 1,
  ticket: 123456789,
  login: 51234567,
  symbol: "EURUSD",
  direction: "buy",
  volume: "1.00",
  openPrice: "1.08500",
  openTimeUtc: "2026-07-17T14:32:05Z",
  closePrice: "1.09000",
  closeTimeUtc: "2026-07-17T16:01:44Z",
  commission: "-3.50",
  swap: "-0.12",
  profit: "496.38",
  accountCurrency: "USD",
  contractSize: "100000.00",
  digits: 5,
  serverGmtOffsetMin: 180,
};

const line = (record: object) => JSON.stringify(record);

describe("mt5RecordSchema", () => {
  it("accetta un record valido dell'EA", () => {
    expect(mt5RecordSchema.safeParse(VALID).success).toBe(true);
  });

  it("rifiuta versione sconosciuta, volume nullo, orari non ISO", () => {
    expect(mt5RecordSchema.safeParse({ ...VALID, v: 2 }).success).toBe(false);
    expect(mt5RecordSchema.safeParse({ ...VALID, volume: "0" }).success).toBe(false);
    expect(
      mt5RecordSchema.safeParse({ ...VALID, openTimeUtc: "17/07/2026 14:32" })
        .success,
    ).toBe(false);
    expect(
      mt5RecordSchema.safeParse({ ...VALID, closeTimeUtc: "2026-02-31T10:00:00Z" })
        .success,
    ).toBe(false); // data inesistente
  });

  it("commission/swap/profit accettano il segno", () => {
    const parsed = mt5RecordSchema.safeParse({
      ...VALID,
      commission: "-3.50",
      swap: "0",
      profit: "-120.75",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("parseMt5File", () => {
  it("legge le righe valide e salta le vuote", () => {
    const content = `${line(VALID)}\n\n${line({ ...VALID, ticket: 2 })}\n`;
    const result = parseMt5File(content);
    expect(result.records).toHaveLength(2);
    expect(result.malformed).toHaveLength(0);
    expect(result.partialTail).toBe(false);
  });

  it("riga malformata IN MEZZO → errore contato, le altre passano", () => {
    const content = `${line(VALID)}\n{rotta\n${line({ ...VALID, ticket: 2 })}\n`;
    const result = parseMt5File(content);
    expect(result.records).toHaveLength(2);
    expect(result.malformed).toEqual([{ line: 2, error: "JSON non valido" }]);
  });

  it("ULTIMA riga troncata senza newline = EA a metà scrittura: skippata in silenzio", () => {
    const content = `${line(VALID)}\n{"v":1,"ticket":99,"sym`;
    const result = parseMt5File(content);
    expect(result.records).toHaveLength(1);
    expect(result.malformed).toHaveLength(0);
    expect(result.partialTail).toBe(true);
  });

  it("ultima riga invalida MA con newline finale → malformata (non parziale)", () => {
    const content = `${line(VALID)}\n{rotta}\n`;
    const result = parseMt5File(content);
    expect(result.records).toHaveLength(1);
    expect(result.malformed).toHaveLength(1);
    expect(result.partialTail).toBe(false);
  });

  it("record JSON valido ma campi invalidi → malformata con path del campo", () => {
    const content = `${line({ ...VALID, direction: "hold" })}\n`;
    const result = parseMt5File(content);
    expect(result.records).toHaveLength(0);
    expect(result.malformed[0].error).toContain("direction");
  });

  it("BOM UTF-8 iniziale ignorato", () => {
    const result = parseMt5File(`﻿${line(VALID)}\n`);
    expect(result.records).toHaveLength(1);
  });
});

describe("mt5RecordToImportRow", () => {
  const options = { timezone: "Europe/Rome", assetClass: "FOREX" as const };

  it("buy → entry BUY / exit SELL, fee = |commission| + |swap| sull'ingresso", () => {
    const row = mt5RecordToImportRow(VALID, options);
    expect(row.brokerTicketId).toBe("123456789");
    expect(row.brokerProfit).toBe("496.38");
    expect(row.input.symbol).toBe("EURUSD");
    expect(row.input.pointValue).toBe("100000.00"); // contractSize
    expect(row.input.executions).toHaveLength(2);
    const [entry, exit] = row.input.executions;
    expect(entry.side).toBe("BUY");
    expect(entry.price).toBe("1.08500");
    expect(entry.fee).toBe("3.62"); // 3.50 + 0.12
    expect(exit.side).toBe("SELL");
    expect(exit.price).toBe("1.09000");
    expect(exit.fee).toBe("0");
  });

  it("orari UTC → datetime-local nel fuso utente CON i secondi (Roma estate = +2)", () => {
    const row = mt5RecordToImportRow(VALID, options);
    expect(row.input.executions[0].executedAt).toBe("2026-07-17T16:32:05");
    expect(row.input.executions[1].executedAt).toBe("2026-07-17T18:01:44");
  });

  it("sell → entry SELL / exit BUY", () => {
    const row = mt5RecordToImportRow({ ...VALID, direction: "sell" }, options);
    expect(row.input.executions[0].side).toBe("SELL");
    expect(row.input.executions[1].side).toBe("BUY");
  });

  it("profit broker normalizzato a scala 2", () => {
    const row = mt5RecordToImportRow({ ...VALID, profit: "-120.5" }, options);
    expect(row.brokerProfit).toBe("-120.50");
  });
});
