import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { ALL_ACCOUNTS, DEMO_USER_EMAIL } from "@/lib/constants";

/**
 * Test di INTEGRAZIONE su Postgres per il conto demo globale SIM1
 * (Opzione A: una sola copia condivisa, di un utente di sistema).
 *
 * Verifica le tre promesse del modello:
 * ① i dati sul DB coincidono con la golden fixture (stesso netto per
 *    strumento asserito dai test puri: il seed non introduce derive);
 * ② SIM1 NON entra mai negli aggregati di un utente normale, nemmeno con
 *    "Tutti i conti" — è il rischio principale di un conto condiviso;
 * ③ un utente qualunque, selezionando SIM1, vede i dati demo (lettura) ma
 *    non può scriverli (le query di scrittura filtrano isDemo: false).
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-demo-account@test.local";

describe.skipIf(!hasDb)("conto demo SIM1 su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let getTradeAggregates: any;
  let getCurrencyBreakdown: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";
  let ownAccountId = "";
  let demoAccountId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ getTradeAggregates, getCurrencyBreakdown } = await import(
      "@/lib/queries/stats"
    ));

    const demo = await prisma.tradingAccount.findFirst({
      where: { isDemo: true },
      select: { id: true },
    });
    demoAccountId = demo?.id ?? "";

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        timezone: "Europe/Rome",
        tradingAccounts: {
          create: [{ name: "Conto mio", currency: "USD", initialBalance: "1000" }],
        },
      },
      include: { tradingAccounts: true },
    });
    userId = user.id;
    ownAccountId = user.tradingAccounts[0].id;

    await prisma.trade.create({
      data: {
        tradingAccountId: ownAccountId,
        symbol: "MIO",
        assetClass: "FUTURES",
        direction: "LONG",
        status: "CLOSED",
        openedAt: new Date("2026-07-20T14:00:00Z"),
        closedAt: new Date("2026-07-20T15:00:00Z"),
        quantity: "1",
        avgEntryPrice: "100",
        avgExitPrice: "110",
        grossPnl: "100.00",
        fees: "0",
        netPnl: "100.00",
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  });

  it("il conto demo esiste, appartiene all'utente di sistema ed è marcato isDemo", async () => {
    expect(demoAccountId).not.toBe("");
    const account = await prisma.tradingAccount.findUnique({
      where: { id: demoAccountId },
      include: { user: { select: { email: true, passwordHash: true } } },
    });
    expect(account.isDemo).toBe(true);
    expect(account.name).toBe("SIM1");
    expect(account.user.email).toBe(DEMO_USER_EMAIL);
    // Nessuna password: l'utente di sistema non può fare login.
    expect(account.user.passwordHash).toBeNull();
  });

  it("sul DB ci sono i 200 trade chiusi + 2 aperti della fixture", async () => {
    const [closed, open] = await Promise.all([
      prisma.trade.count({
        where: { tradingAccountId: demoAccountId, status: "CLOSED" },
      }),
      prisma.trade.count({
        where: { tradingAccountId: demoAccountId, status: "OPEN" },
      }),
    ]);
    expect(closed).toBe(200);
    expect(open).toBe(2);
  });

  it("il netto per strumento sul DB è quello golden (nessuna deriva nel seed)", async () => {
    const rows = await prisma.trade.groupBy({
      by: ["symbol"],
      where: { tradingAccountId: demoAccountId, status: "CLOSED" },
      _sum: { netPnl: true },
      _count: true,
    });
    const actual = Object.fromEntries(
      rows.map((r: { symbol: string; _count: number; _sum: { netPnl: Decimal } }) => [
        r.symbol,
        { trades: r._count, net: new Decimal(r._sum.netPnl.toString()).toFixed(2) },
      ]),
    );
    expect(actual).toEqual({
      ES: { trades: 47, net: "10676.20" },
      NQ: { trades: 53, net: "13021.80" },
      GC: { trades: 56, net: "10765.00" },
      CL: { trades: 44, net: "435.00" },
    });
  });

  it("NON entra negli aggregati di un altro utente, nemmeno con 'Tutti i conti'", async () => {
    const aggregates = await getTradeAggregates({
      userId,
      accountId: ALL_ACCOUNTS,
    });
    // Solo il trade dell'utente di test: i 200 di SIM1 restano fuori.
    expect(aggregates.total).toBe(1);
    expect(aggregates.netPnl).toBe("100.00");

    const currencies = await getCurrencyBreakdown({
      userId,
      accountId: ALL_ACCOUNTS,
    });
    expect(currencies).toEqual([{ currency: "USD", netPnl: "100.00", trades: 1 }]);
  });

  it("selezionando SIM1 un utente qualunque vede i dati demo (lettura)", async () => {
    // Lo scope demo gira sull'utente di SISTEMA: è ciò che fa resolveTradeScope.
    const demoAccount = await prisma.tradingAccount.findUnique({
      where: { id: demoAccountId },
      select: { userId: true },
    });
    const aggregates = await getTradeAggregates({
      userId: demoAccount.userId,
      accountId: demoAccountId,
    });
    expect(aggregates.total).toBe(200);
    expect(aggregates.netPnl).toBe("34898.00");
  });

  it("le scritture sul conto demo non trovano nulla da modificare", async () => {
    const demoTrade = await prisma.trade.findFirst({
      where: { tradingAccountId: demoAccountId },
      select: { id: true, netPnl: true },
    });

    // Stesso `where` delle server action di update/delete (userId + isDemo).
    const updated = await prisma.trade.updateMany({
      where: { id: demoTrade.id, account: { userId, isDemo: false } },
      data: { netPnl: "999999.00" },
    });
    const deleted = await prisma.trade.deleteMany({
      where: { id: demoTrade.id, account: { userId, isDemo: false } },
    });
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);

    const after = await prisma.trade.findUnique({
      where: { id: demoTrade.id },
      select: { netPnl: true },
    });
    expect(after.netPnl.toString()).toBe(demoTrade.netPnl.toString());
  });

  it("nemmeno il proprietario di sistema è raggiungibile: il conto non è dell'utente", async () => {
    const owned = await prisma.tradingAccount.findFirst({
      where: { id: demoAccountId, userId },
      select: { id: true },
    });
    expect(owned).toBeNull();
  });
});
