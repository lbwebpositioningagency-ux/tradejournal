import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE su Postgres per il sync MT5:
 * - la dedup su brokerTicketId è idempotente (stesso file riletto → 0 doppioni)
 *   e PER CONTO (stesso ticket su due conti = due trade legittimi);
 * - la pipeline condivisa calcola il netto (Zod → computeTrade → Prisma) e la
 *   divergenza dal profit broker viene segnalata, non "corretta".
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-mt5-sync@test.local";

const record = (ticket: number, overrides: Record<string, unknown> = {}) => ({
  v: 1 as const,
  ticket,
  login: 51234567,
  symbol: "EURUSD",
  direction: "buy" as const,
  volume: "1.00",
  openPrice: "1.08500",
  openTimeUtc: "2026-07-17T14:32:05Z",
  closePrice: "1.09000",
  closeTimeUtc: "2026-07-17T16:01:44Z",
  commission: "-3.50",
  swap: "0",
  // netto atteso dalla pipeline: gross 500 (0.005×1×100000) − fee 3.50
  profit: "496.50",
  accountCurrency: "USD",
  contractSize: "100000",
  digits: 5,
  serverGmtOffsetMin: 180,
  ...overrides,
});

describe.skipIf(!hasDb)("sync MT5 su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let persistTradeInputs: any;
  let mt5RecordToImportRow: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";
  let accountA = "";
  let accountB = "";

  const toRows = (records: ReturnType<typeof record>[]) =>
    records.map((r) =>
      mt5RecordToImportRow(r, { timezone: "Europe/Rome", assetClass: "FOREX" }),
    );

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ persistTradeInputs } = await import("@/lib/import-core"));
    ({ mt5RecordToImportRow } = await import("@/lib/mt5-import"));

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        timezone: "Europe/Rome",
        tradingAccounts: {
          create: [
            { name: "Prop A", currency: "USD" },
            { name: "Prop B", currency: "USD" },
          ],
        },
      },
      include: { tradingAccounts: true },
    });
    userId = user.id;
    accountA = user.tradingAccounts[0].id;
    accountB = user.tradingAccounts[1].id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  it("importa, calcola con la pipeline e salva il brokerTicketId", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountA,
      timezone: "Europe/Rome",
      rows: toRows([record(1001), record(1002, { direction: "sell", profit: "-503.50" })]),
    });
    expect(result).toMatchObject({ imported: 2, duplicates: 0 });
    expect(result.failed).toHaveLength(0);
    expect(result.divergences).toHaveLength(0); // profit broker = netto pipeline

    const saved = await prisma.trade.findFirst({
      where: { tradingAccountId: accountA, brokerTicketId: "1001" },
    });
    expect(saved).not.toBeNull();
    expect(saved.netPnl.toString()).toBe("496.5"); // 500 gross − 3.50 fee
    expect(saved.direction).toBe("LONG");
    expect(saved.status).toBe("CLOSED");
  });

  it("DEDUP: rileggere lo stesso file non crea mai doppioni", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountA,
      timezone: "Europe/Rome",
      rows: toRows([record(1001), record(1002), record(1003)]),
    });
    expect(result.imported).toBe(1); // solo il 1003 è nuovo
    expect(result.duplicates).toBe(2);

    const count = await prisma.trade.count({
      where: { tradingAccountId: accountA, brokerTicketId: { in: ["1001", "1002"] } },
    });
    expect(count).toBe(2); // ancora uno per ticket
  });

  it("stesso ticket su un ALTRO conto = trade legittimo (dedup per conto)", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountB,
      timezone: "Europe/Rome",
      rows: toRows([record(1001)]),
    });
    expect(result).toMatchObject({ imported: 1, duplicates: 0 });
  });

  it("doppione DENTRO lo stesso batch → una sola insert", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountA,
      timezone: "Europe/Rome",
      rows: toRows([record(2001), record(2001)]),
    });
    expect(result).toMatchObject({ imported: 1, duplicates: 1 });
  });

  it("divergenza P&L: profit broker ≠ netto calcolato → segnalata, trade importato", async () => {
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountA,
      timezone: "Europe/Rome",
      rows: toRows([record(3001, { profit: "450.00" })]), // pipeline: 496.50
    });
    expect(result.imported).toBe(1);
    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0]).toMatchObject({
      brokerTicketId: "3001",
      computedNet: "496.50",
      brokerProfit: "450.00",
    });
  });

  it("riga invalida nel batch → scartata con errore, le altre importate", async () => {
    const rows = toRows([record(4001), record(4002, { closeTimeUtc: "2026-07-17T10:00:00Z" })]);
    // 4002 chiude PRIMA di aprire → direzione incoerente → scartata
    const result = await persistTradeInputs({
      userId,
      tradingAccountId: accountA,
      timezone: "Europe/Rome",
      rows,
    });
    expect(result.imported).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].row).toBe(2);
  });
});
