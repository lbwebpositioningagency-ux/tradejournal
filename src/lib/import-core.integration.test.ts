import "dotenv/config";
import Papa from "papaparse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTradeInput } from "@/lib/csv-import";
import type { TradeInput } from "@/lib/validations/trade";

/**
 * Test di INTEGRAZIONE su Postgres per la Fase 7 (import robusto):
 * - F13: valore punto PER RIGA in un CSV misto ES+NQ+GC → netPnl per simbolo
 *   corretti (il bug originale: un solo moltiplicatore per tutto il file);
 * - F14: re-import dello stesso batch → righe skippate per fingerprint,
 *   mai duplicati silenziosi; opt-out esplicito per importarle comunque.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

const TEST_EMAIL = "it-import-core@test.local";
const ROME = "Europe/Rome";

/** Righe come le costruirebbe buildTradeInput da un CSV misto. */
function mixedRows(accountId: string): TradeInput[] {
  const row = (
    symbol: string,
    pointValue: string,
    entry: string,
    exit: string,
  ): TradeInput => ({
    tradingAccountId: accountId,
    symbol,
    assetClass: "FUTURES",
    pointValue,
    tags: [],
    executions: [
      {
        side: "BUY",
        quantity: "1",
        price: entry,
        fee: "2.10",
        executedAt: "2026-07-20T09:30",
      },
      {
        side: "SELL",
        quantity: "1",
        price: exit,
        fee: "0",
        executedAt: "2026-07-20T10:00",
      },
    ],
  });
  return [
    row("ES", "50", "5000.00", "5010.00"), // +10 pt × 50 − 2.10 = 497.90
    row("NQ", "20", "20000.00", "20050.00"), // +50 pt × 20 − 2.10 = 997.90
    row("GC", "100", "2650.00", "2652.50"), // +2.5 pt × 100 − 2.10 = 247.90
  ];
}

describe.skipIf(!hasDb)("import robusto su Postgres (F13/F14)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let persistTradeInputs: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";
  let accountId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ persistTradeInputs } = await import("@/lib/import-core"));

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        timezone: ROME,
        tradingAccounts: { create: [{ name: "Conto import", currency: "USD" }] },
      },
      include: { tradingAccounts: true },
    });
    userId = user.id;
    accountId = user.tradingAccounts[0].id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  it("F13: CSV misto → netPnl corretto per ogni simbolo", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountId,
      timezone: ROME,
      rows: mixedRows(accountId).map((input) => ({ input })),
      skipFingerprintDuplicates: true,
    });
    expect(result.imported).toBe(3);
    expect(result.duplicates).toBe(0);
    expect(result.failed).toEqual([]);

    const trades = await prisma.trade.findMany({
      where: { tradingAccountId: accountId },
      select: { symbol: true, netPnl: true, pointValue: true },
    });
    const bySymbol = new Map(
      trades.map((t: { symbol: string; netPnl: unknown; pointValue: unknown }) => [
        t.symbol,
        { net: String(t.netPnl), pv: String(t.pointValue) },
      ]),
    );
    expect(bySymbol.get("ES")).toEqual({ net: "497.9", pv: "50" });
    expect(bySymbol.get("NQ")).toEqual({ net: "997.9", pv: "20" });
    expect(bySymbol.get("GC")).toEqual({ net: "247.9", pv: "100" });
  });

  it("F14: re-import identico → tutto skippato, zero duplicati in tabella", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountId,
      timezone: ROME,
      rows: mixedRows(accountId).map((input) => ({ input })),
      skipFingerprintDuplicates: true,
    });
    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(3);

    const count = await prisma.trade.count({
      where: { tradingAccountId: accountId },
    });
    expect(count).toBe(3);
  });

  it("F14: doppioni DENTRO lo stesso batch → una sola copia", async () => {
    const extra: TradeInput = {
      tradingAccountId: accountId,
      symbol: "YM",
      assetClass: "FUTURES",
      pointValue: "5",
      tags: [],
      executions: [
        {
          side: "SELL",
          quantity: "2",
          price: "40000",
          fee: "0",
          executedAt: "2026-07-21T15:00",
        },
        {
          side: "BUY",
          quantity: "2",
          price: "39990",
          fee: "0",
          executedAt: "2026-07-21T15:30",
        },
      ],
    };
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountId,
      timezone: ROME,
      rows: [{ input: extra }, { input: extra }],
      skipFingerprintDuplicates: true,
    });
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("F14: opt-out esplicito → i duplicati si importano davvero", async () => {
    const rows = mixedRows(accountId).slice(0, 1);
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountId,
      timezone: ROME,
      rows: rows.map((input) => ({ input })),
      // Nessuna dedup fingerprint: comportamento pre-F14 (e sync MT5).
    });
    expect(result.imported).toBe(1);
    const count = await prisma.trade.count({
      where: { tradingAccountId: accountId, symbol: "ES" },
    });
    expect(count).toBe(2);
  });

  /* P0 — l'import CSV leggeva stop e target (buildTradeInput li valida e
     ne ricava perfino il targetR, che si salvava) ma persistTradeInputs non
     li scriveva: il trade restava con targetR valorizzato e piano nullo. */
  it("CSV con stop loss e take profit → trade con plannedStop e plannedTarget", async () => {
    const csv = [
      "Symbol;Side;Qty;Entry Price;Exit Price;Entry Time;Exit Time;Fee;SL;TP;Risk",
      "ES;long;1;5100,00;5112,50;22/07/2026 09:30;22/07/2026 10:15;2,10;5090,00;5120,00;500",
    ].join("\n");
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const built = buildTradeInput(
      parsed.data[0],
      {
        columns: {
          symbol: "Symbol",
          direction: "Side",
          quantity: "Qty",
          entryPrice: "Entry Price",
          exitPrice: "Exit Price",
          entryAt: "Entry Time",
          exitAt: "Exit Time",
          fee: "Fee",
          plannedStop: "SL",
          plannedTarget: "TP",
          initialRisk: "Risk",
        },
        dateFormat: "eu",
      },
      { tradingAccountId: accountId, assetClass: "FUTURES", pointValue: "50" },
    );
    if (!built.ok) throw new Error(built.error);

    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountId,
      timezone: ROME,
      rows: [{ input: built.input }],
      skipFingerprintDuplicates: true,
    });
    expect(result).toMatchObject({ imported: 1, failed: [] });

    const saved = await prisma.trade.findFirst({
      where: { tradingAccountId: accountId, avgEntryPrice: "5100" },
      select: { plannedStop: true, plannedTarget: true, targetR: true, rMultiple: true },
    });
    expect(saved.plannedStop?.toString()).toBe("5090");
    expect(saved.plannedTarget?.toString()).toBe("5120");
    // target a 20 punti, stop a 10: il piano vale 2R.
    expect(saved.targetR?.toString()).toBe("2");
    // 12,5 pt × 50 − 2,10 = 622,90 su 500 di rischio.
    expect(saved.rMultiple?.toString()).toBe("1.2458");
  });
});
