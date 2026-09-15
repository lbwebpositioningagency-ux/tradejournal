import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE: un utente con un conto in euro e uno in dollari e
 * NESSUN trade. Prima della correzione lo scope della dashboard restava senza
 * valuta e il Saldo conto sommava 10.000 EUR + 5.000 USD = «15.000».
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-currency-fallback@test.local";

describe.skipIf(!hasDb)("valuta di riserva senza trade", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let getAccountCurrencyTotals: any;
  let getStartingBalance: any;
  let getCurrencyBreakdown: any;
  let resolveCurrencyScope: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ getAccountCurrencyTotals, getStartingBalance, getCurrencyBreakdown } =
      await import("./stats"));
    ({ resolveCurrencyScope } = await import("@/lib/currency-scope"));
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        tradingAccounts: {
          create: [
            { name: "Conto EUR", currency: "EUR", initialBalance: "10000" },
            { name: "Conto USD", currency: "USD", initialBalance: "5000" },
          ],
        },
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  });

  it("senza trade i totali dei trade sono vuoti, quelli dei conti no", async () => {
    expect(await getCurrencyBreakdown({ userId, accountId: "all" })).toEqual([]);
    const totals = await getAccountCurrencyTotals({ userId, accountId: "all" });
    expect(totals.map((t: { currency: string }) => t.currency).sort()).toEqual(["EUR", "USD"]);
  });

  it("il saldo si calcola in UNA valuta, mai 10.000 + 5.000", async () => {
    const totals = await getAccountCurrencyTotals({ userId, accountId: "all" });
    const scope = resolveCurrencyScope(totals, "USD");
    expect(scope.active).toBe("USD");
    expect(scope.multi).toBe(true);
    const balance = await getStartingBalance({ userId, accountId: "all", currency: scope.active });
    expect(balance).toBe("5000.00");
    // La somma che la dashboard mostrava prima:
    expect(await getStartingBalance({ userId, accountId: "all" })).toBe("15000.00");
  });
});
