import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { zonedInputToUtc } from "@/lib/dates";
import { buildTradeFilterWhere } from "@/lib/trade-filters";

/**
 * Test di INTEGRAZIONE su Postgres per i casi limite che il seed ora
 * garantisce in modo deterministico (audit fasi 6-8):
 * - trade APERTI: classificazione del filtro esito (netPnl = −fee → "loss",
 *   fee zero → "be") ed esclusione dalle metriche sui trade chiusi;
 * - trade overnight a cavallo di un confine di periodo: la divergenza attesa
 *   tra Trade View (filtro su openedAt) e Reports/dashboard (closedAt) è
 *   QUANTIFICATA, non solo dichiarata;
 * - "Tutti i conti" esclude i conti archiviati anche in Trade View.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

const TEST_EMAIL = "it-trade-filters@test.local";
const ROME = "Europe/Rome";

describe.skipIf(!hasDb)("filtri Trade View su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let tradeAccountWhere: any;
  let getTradeAggregates: any;
  let getLifetimeNetPnl: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ tradeAccountWhere } = await import("@/lib/active-account"));
    ({ getTradeAggregates, getLifetimeNetPnl } = await import(
      "@/lib/queries/stats"
    ));

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        timezone: ROME,
        tradingAccounts: {
          create: [
            { name: "Conto attivo", currency: "USD" },
            { name: "Conto archiviato", currency: "USD", isArchived: true },
          ],
        },
      },
      include: { tradingAccounts: true },
    });
    userId = user.id;
    const mainId = user.tradingAccounts[0].id;
    const archivedId = user.tradingAccounts[1].id;

    const base = {
      assetClass: "FUTURES" as const,
      direction: "LONG" as const,
      quantity: "1",
      avgEntryPrice: "100",
    };

    await prisma.trade.createMany({
      data: [
        // Trade APERTO con fee di ingresso: netPnl = −fee → esito "loss".
        {
          ...base,
          tradingAccountId: mainId,
          symbol: "OPENLOSS",
          status: "OPEN",
          openedAt: new Date("2026-07-13T14:30:00Z"),
          closedAt: null,
          grossPnl: "0",
          fees: "8.40",
          netPnl: "-8.40",
        },
        // Trade APERTO senza fee: netPnl = 0 → esito "be".
        {
          ...base,
          tradingAccountId: mainId,
          symbol: "OPENBE",
          status: "OPEN",
          openedAt: new Date("2026-07-14T09:15:00Z"),
          closedAt: null,
          grossPnl: "0",
          fees: "0",
          netPnl: "0",
        },
        // Overnight: aperto gio 09/07 23:30 Roma, chiuso ven 10/07 00:30 Roma.
        {
          ...base,
          tradingAccountId: mainId,
          symbol: "OVERNIGHT",
          status: "CLOSED",
          openedAt: new Date("2026-07-09T21:30:00Z"),
          closedAt: new Date("2026-07-09T22:30:00Z"),
          avgExitPrice: "101",
          grossPnl: "400.00",
          fees: "4.20",
          netPnl: "395.80",
        },
        // Chiuso interamente dentro il periodo dal 10/07.
        {
          ...base,
          tradingAccountId: mainId,
          symbol: "REGULAR",
          status: "CLOSED",
          openedAt: new Date("2026-07-10T10:00:00Z"),
          closedAt: new Date("2026-07-10T11:00:00Z"),
          avgExitPrice: "101",
          grossPnl: "100.00",
          fees: "0",
          netPnl: "100.00",
        },
        // Chiuso PRIMA del periodo: conta solo nel P&L storico (saldo).
        {
          ...base,
          tradingAccountId: mainId,
          symbol: "OLD",
          status: "CLOSED",
          openedAt: new Date("2026-07-01T10:00:00Z"),
          closedAt: new Date("2026-07-01T11:00:00Z"),
          avgExitPrice: "101",
          grossPnl: "50.00",
          fees: "0",
          netPnl: "50.00",
        },
        // Trade su conto ARCHIVIATO: mai visibile con "Tutti i conti".
        {
          ...base,
          tradingAccountId: archivedId,
          symbol: "ARCHIVED",
          status: "CLOSED",
          openedAt: new Date("2026-07-10T12:00:00Z"),
          closedAt: new Date("2026-07-10T13:00:00Z"),
          avgExitPrice: "101",
          grossPnl: "77.00",
          fees: "0",
          netPnl: "77.00",
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  async function symbolsFor(
    where: Record<string, unknown>,
  ): Promise<string[]> {
    const rows: { symbol: string }[] = await prisma.trade.findMany({
      where,
      select: { symbol: true },
      orderBy: { symbol: "asc" },
    });
    return rows.map((r) => r.symbol);
  }

  it("esito 'loss': il trade appena aperto con sola fee (netPnl = −fee) è incluso", async () => {
    const where = {
      ...tradeAccountWhere(userId, ALL_ACCOUNTS),
      ...buildTradeFilterWhere({ outcome: "loss" }),
    };
    expect(await symbolsFor(where)).toEqual(["OPENLOSS"]);
  });

  it("esito 'be': il trade aperto senza fee (netPnl = 0) è incluso", async () => {
    const where = {
      ...tradeAccountWhere(userId, ALL_ACCOUNTS),
      ...buildTradeFilterWhere({ outcome: "be" }),
    };
    expect(await symbolsFor(where)).toEqual(["OPENBE"]);
  });

  it("stato 'Aperto': trova entrambi i trade aperti", async () => {
    const where = {
      ...tradeAccountWhere(userId, ALL_ACCOUNTS),
      ...buildTradeFilterWhere({ status: "OPEN" }),
    };
    expect(await symbolsFor(where)).toEqual(["OPENBE", "OPENLOSS"]);
  });

  it("i trade aperti non contano nelle metriche sui chiusi (aggregati e saldo)", async () => {
    const agg = await getTradeAggregates({ userId, accountId: ALL_ACCOUNTS });
    expect(agg.total).toBe(3); // OVERNIGHT + REGULAR + OLD
    expect(agg.netPnl).toBe("545.80");

    const lifetime = await getLifetimeNetPnl({ userId, accountId: ALL_ACCOUNTS });
    expect(lifetime).toBe("545.80"); // niente −8.40 dei trade aperti
  });

  it("divergenza openedAt/closedAt sul confine 10/07 (fuso Roma): quantificata", async () => {
    // from = mezzanotte del 10/07 a Roma = 2026-07-09T22:00Z.
    const from = zonedInputToUtc("2026-07-10T00:00", ROME);

    // Lato Trade View: filtro periodo su openedAt. L'overnight (aperto il
    // 09/07 alle 23:30 di Roma) resta FUORI; i due aperti e REGULAR dentro.
    const tradeView = await symbolsFor({
      ...tradeAccountWhere(userId, ALL_ACCOUNTS),
      ...buildTradeFilterWhere({}, { from }),
    });
    expect(tradeView).toEqual(["OPENBE", "OPENLOSS", "REGULAR"]);

    // Lato Reports/dashboard: filtro su closedAt, solo chiusi. L'overnight
    // (chiuso il 10/07 alle 00:30 di Roma) è DENTRO; gli aperti mai.
    const closedAgg = await getTradeAggregates({
      userId,
      accountId: ALL_ACCOUNTS,
      from,
    });
    expect(closedAgg.total).toBe(2); // OVERNIGHT + REGULAR
    expect(closedAgg.netPnl).toBe("495.80");

    // La divergenza attesa è ESATTAMENTE: overnight solo lato closedAt,
    // trade aperti solo lato openedAt, REGULAR in entrambi.
  });

  it("'Tutti i conti' esclude i conti archiviati anche in Trade View", async () => {
    const all = await symbolsFor(tradeAccountWhere(userId, ALL_ACCOUNTS));
    expect(all).not.toContain("ARCHIVED");
    expect(all).toHaveLength(5);

    // Il conto archiviato resta interrogabile selezionandolo esplicitamente.
    const archivedAccount = await prisma.tradingAccount.findFirst({
      where: { userId, isArchived: true },
      select: { id: true },
    });
    const direct = await symbolsFor(
      tradeAccountWhere(userId, archivedAccount.id),
    );
    expect(direct).toEqual(["ARCHIVED"]);
  });
});
