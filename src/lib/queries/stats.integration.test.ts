import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE sul database reale (Postgres via docker `db:up`).
 *
 * Verifica il bucketing giornaliero/settimanale nel fuso utente per i trade
 * chiusi nella fascia critica attorno alla mezzanotte locale (22:00–04:00 UTC
 * per Europe/Rome): è il caso che i test unitari non possono coprire, perché
 * la conversione avviene in SQL (`AT TIME ZONE`) e dipende dalla semantica
 * dei timestamp naive di Postgres.
 *
 * Si salta se DATABASE_URL non è configurata (es. ambienti senza DB).
 */

const hasDb = Boolean(process.env.DATABASE_URL);

const TEST_EMAIL = "it-timezone-bucketing@test.local";
const ROME = "Europe/Rome";

describe.skipIf(!hasDb)("bucketing timezone su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let getDailyPnl: any;
  let getPeriodPnl: any;
  let getTradeAggregates: any;
  let getLifetimeNetPnl: any;
  let getHourBreakdown: any;
  let getWeekdayBreakdown: any;
  let getStreakStats: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";
  let accountId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ getDailyPnl, getPeriodPnl, getTradeAggregates, getLifetimeNetPnl } =
      await import("./stats"));
    ({ getHourBreakdown, getWeekdayBreakdown, getStreakStats } = await import(
      "./reports"
    ));

    // Pulizia di eventuali residui di run precedenti falliti
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        timezone: ROME,
        tradingAccounts: { create: { name: "Conto test TZ", currency: "USD" } },
      },
      include: { tradingAccounts: true },
    });
    userId = user.id;
    accountId = user.tradingAccounts[0].id;

    const trade = (closedAtUtc: string, netPnl: string) => ({
      tradingAccountId: accountId,
      symbol: "TZTEST",
      assetClass: "FUTURES" as const,
      direction: "LONG" as const,
      status: "CLOSED" as const,
      openedAt: new Date(closedAtUtc),
      closedAt: new Date(closedAtUtc),
      quantity: "1",
      avgEntryPrice: "100",
      avgExitPrice: "101",
      grossPnl: netPnl,
      fees: "0",
      netPnl,
    });

    await prisma.trade.createMany({
      data: [
        // 22:30 UTC in estate (Roma UTC+2) = 00:30 del giorno DOPO a Roma
        trade("2026-07-15T22:30:00Z", "100.00"),
        // 03:00 UTC = 05:00 a Roma, stesso giorno di calendario
        trade("2026-07-15T03:00:00Z", "50.00"),
        // 23:30 UTC in inverno (Roma UTC+1) = 00:30 del giorno DOPO a Roma
        trade("2026-01-15T23:30:00Z", "25.00"),
        // Domenica 12/07 22:30 UTC = lunedì 13/07 00:30 a Roma → settimana nuova
        trade("2026-07-12T22:30:00Z", "10.00"),
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  it("un trade chiuso tra le 22:00 e le 24:00 UTC cade nel giorno di Roma successivo", async () => {
    const daily = await getDailyPnl({ userId, accountId }, ROME);
    const byDay = Object.fromEntries(
      daily.map((d: { day: string; netPnl: string }) => [d.day, d.netPnl]),
    );

    expect(byDay["2026-07-16"]).toBe("100.00"); // 15/07 22:30Z → 16/07 (estate, +2)
    expect(byDay["2026-07-15"]).toBe("50.00"); // 15/07 03:00Z → 15/07
    expect(byDay["2026-01-16"]).toBe("25.00"); // 15/01 23:30Z → 16/01 (inverno, +1)
    expect(byDay["2026-07-13"]).toBe("10.00"); // domenica sera UTC → lunedì a Roma
    // Nessun bucket sul giorno UTC sbagliato
    expect(byDay["2026-01-15"]).toBeUndefined();
    expect(byDay["2026-07-12"]).toBeUndefined();
  });

  it("report orario: le 22:30 UTC d'estate sono l'ora 0 di Roma (apertura)", async () => {
    const hours = await getHourBreakdown({ userId, accountId }, ROME);
    const byHour = Object.fromEntries(
      hours.map((h: { hour: number; total: number; netPnl: string }) => [
        h.hour,
        h,
      ]),
    );
    // 15/07 22:30Z (estate) + 15/01 23:30Z (inverno) + 12/07 22:30Z → 00:30 Roma
    expect(byHour[0]?.total).toBe(3);
    expect(byHour[0]?.netPnl).toBe("135.00"); // 100 + 25 + 10
    // 15/07 03:00Z → 05:00 Roma
    expect(byHour[5]?.total).toBe(1);
    expect(byHour[22]).toBeUndefined(); // niente bucket sull'ora UTC sbagliata
  });

  it("report giorno settimana: apertura dopo mezzanotte di Roma slitta di giorno ISO", async () => {
    const days = await getWeekdayBreakdown({ userId, accountId }, ROME);
    const byDay = Object.fromEntries(
      days.map((d: { weekday: number; netPnl: string }) => [d.weekday, d.netPnl]),
    );
    expect(byDay[1]).toBe("10.00"); // dom 12/07 22:30Z → LUNEDÌ a Roma
    expect(byDay[3]).toBe("50.00"); // mer 15/07 03:00Z → mercoledì
    expect(byDay[4]).toBe("100.00"); // mer 15/07 22:30Z → GIOVEDÌ a Roma
    expect(byDay[5]).toBe("25.00"); // gio 15/01 23:30Z → VENERDÌ a Roma
    expect(byDay[7]).toBeUndefined(); // nessuna domenica
  });

  it("saldo conto: il P&L storico (getLifetimeNetPnl) ignora il filtro periodo attivo", async () => {
    // Periodo attivo: da luglio in poi → il trade di gennaio (25.00) esce
    // dagli aggregati di periodo ma NON dal P&L storico su cui si basa
    // il saldo conto della dashboard.
    const from = new Date("2026-07-01T00:00:00Z");
    const periodAgg = await getTradeAggregates({ userId, accountId, from });
    const lifetime = await getLifetimeNetPnl({ userId, accountId });

    expect(periodAgg.netPnl).toBe("160.00"); // 100 + 50 + 10, senza gennaio
    expect(lifetime).toBe("185.00"); // tutto lo storico, gennaio incluso
  });

  it("streak SQL: quattro win consecutivi, nessuna loss streak", async () => {
    const streaks = await getStreakStats({ userId, accountId });
    expect(streaks).toEqual({ maxWinStreak: 4, maxLossStreak: 0 });
  });

  it("Q-01: col filtro periodo attivo la base della curva è l'equity a inizio periodo, non il saldo iniziale", async () => {
    // Convenzione fissata dal fix del rilievo Q-01/B-01: la dashboard passa
    // a maxDrawdown/ulcer/calmar/underwater una base = saldo iniziale +
    // getNetPnlBefore(from). Questo test blocca la composizione delle query.
    const { maxDrawdown } = await import("@/lib/metrics");
    const { default: Decimal } = await import("decimal.js");
    const { prisma: db } = await import("@/lib/db");

    const email = "it-dd-period-base@test.local";
    await db.user.deleteMany({ where: { email } });
    const user = await db.user.create({
      data: {
        email,
        timezone: ROME,
        tradingAccounts: {
          create: {
            name: "Conto DD periodo",
            currency: "USD",
            initialBalance: "10000",
          },
        },
      },
      include: { tradingAccounts: true },
    });
    const acc = user.tradingAccounts[0].id;
    const mk = (closedAtUtc: string, netPnl: string) => ({
      tradingAccountId: acc,
      symbol: "DDTEST",
      assetClass: "FUTURES" as const,
      direction: "LONG" as const,
      status: "CLOSED" as const,
      openedAt: new Date(closedAtUtc),
      closedAt: new Date(closedAtUtc),
      quantity: "1",
      avgEntryPrice: "100",
      avgExitPrice: "101",
      grossPnl: netPnl,
      fees: "0",
      netPnl,
    });
    try {
      await db.trade.createMany({
        data: [
          // PRIMA del periodo: +5.000 → equity a inizio periodo 15.000
          mk("2026-06-01T12:00:00Z", "5000.00"),
          // NEL periodo: +1.000 poi −1.500 → picco 16.000, DD 1.500
          mk("2026-07-02T12:00:00Z", "1000.00"),
          mk("2026-07-03T12:00:00Z", "-1500.00"),
        ],
      });

      const from = new Date("2026-07-01T00:00:00Z");
      const filter = { userId: user.id, accountId: acc, from };
      const { getStartingBalance, getNetPnlBefore, getDailyPnl } =
        await import("./stats");
      const [balance, before, dailyPeriod] = await Promise.all([
        getStartingBalance(filter),
        getNetPnlBefore({ userId: user.id, accountId: acc }, from),
        getDailyPnl(filter, ROME),
      ]);

      expect(balance).toBe("10000.00");
      expect(before).toBe("5000.00");
      const equityStart = new Decimal(balance).plus(before).toFixed(2);
      const dd = maxDrawdown(dailyPeriod, equityStart);
      // DD in $ identico con qualunque base; la % è sul picco VERO (16.000),
      // non su quello monco del solo saldo iniziale (11.000 → 0.1364).
      expect(dd.maxDrawdown).toBe("1500.00");
      expect(dd.maxDrawdownPct).toBe("0.0938"); // 1500 / 16000
      expect(maxDrawdown(dailyPeriod, balance).maxDrawdownPct).toBe("0.1364");
    } finally {
      await db.user.deleteMany({ where: { email } });
    }
  });

  it("B-02: utente bi-valuta con periodo senza trade — il saldo non somma mai valute diverse", async () => {
    // Convenzione fissata dal fix B-02: i widget lifetime risolvono la
    // valuta sulle valute di TUTTO lo storico (getCurrencyBreakdown senza
    // periodo), e con periodo vuoto lo scope ricade su quelle — mai una
    // query di denaro senza vincolo di valuta.
    const { resolveCurrencyScope } = await import("@/lib/currency-scope");
    const { prisma: db } = await import("@/lib/db");
    const {
      getCurrencyBreakdown,
      getStartingBalance,
      getLifetimeNetPnl,
    } = await import("./stats");

    const email = "it-bicurrency-empty-period@test.local";
    await db.user.deleteMany({ where: { email } });
    const user = await db.user.create({
      data: {
        email,
        timezone: ROME,
        tradingAccounts: {
          create: [
            { name: "Conto USD", currency: "USD", initialBalance: "1000" },
            { name: "Conto EUR", currency: "EUR", initialBalance: "2000" },
          ],
        },
      },
      include: { tradingAccounts: true },
    });
    const usd = user.tradingAccounts.find((a: { currency: string }) => a.currency === "USD")!.id;
    const eur = user.tradingAccounts.find((a: { currency: string }) => a.currency === "EUR")!.id;
    const mk = (acc: string, closedAtUtc: string, netPnl: string) => ({
      tradingAccountId: acc,
      symbol: "CURTEST",
      assetClass: "FUTURES" as const,
      direction: "LONG" as const,
      status: "CLOSED" as const,
      openedAt: new Date(closedAtUtc),
      closedAt: new Date(closedAtUtc),
      quantity: "1",
      avgEntryPrice: "100",
      avgExitPrice: "101",
      grossPnl: netPnl,
      fees: "0",
      netPnl,
    });
    try {
      await db.trade.createMany({
        data: [
          // USD prevalente (2 trade), EUR minoritaria (1 trade).
          mk(usd, "2026-05-04T12:00:00Z", "100.00"),
          mk(usd, "2026-05-05T12:00:00Z", "50.00"),
          mk(eur, "2026-05-06T12:00:00Z", "200.00"),
        ],
      });

      // Periodo custom SENZA trade (una settimana di ferie a giugno).
      const from = new Date("2026-06-08T00:00:00Z");
      const to = new Date("2026-06-15T00:00:00Z");
      const { ALL_ACCOUNTS } = await import("@/lib/constants");
      const scopeFilter = { userId: user.id, accountId: ALL_ACCOUNTS };
      const [periodTotals, lifetimeTotals] = await Promise.all([
        getCurrencyBreakdown({ ...scopeFilter, from, to }),
        getCurrencyBreakdown(scopeFilter),
      ]);

      // Il periodo vuoto non produce valute; lo storico sì, prevalente prima.
      expect(periodTotals).toEqual([]);
      expect(lifetimeTotals.map((t) => t.currency)).toEqual(["USD", "EUR"]);

      // Composizione della dashboard: fallback sullo scope lifetime.
      const scope = resolveCurrencyScope(
        periodTotals.length > 0 ? periodTotals : lifetimeTotals,
      );
      const lifetimeScope = resolveCurrencyScope(lifetimeTotals);
      expect(scope.active).toBe("USD");
      expect(lifetimeScope.active).toBe("USD");

      // Il saldo resta nella sola valuta attiva…
      const [balance, lifetimePnl] = await Promise.all([
        getStartingBalance({ ...scopeFilter, currency: lifetimeScope.active }),
        getLifetimeNetPnl({ ...scopeFilter, currency: lifetimeScope.active }),
      ]);
      expect(balance).toBe("1000.00");
      expect(lifetimePnl).toBe("150.00");
      // …mentre la query SENZA vincolo di valuta sommerebbe USD+EUR: è il
      // numero "fasullo" (3000 / 350) che non deve mai arrivare alla UI.
      expect(await getStartingBalance(scopeFilter)).toBe("3000.00");
      expect(await getLifetimeNetPnl(scopeFilter)).toBe("350.00");
    } finally {
      await db.user.deleteMany({ where: { email } });
    }
  });

  it("la domenica sera UTC (lunedì a Roma) apre la settimana del lunedì", async () => {
    const weeks = await getPeriodPnl({ userId, accountId }, ROME, "week");
    const byWeek = Object.fromEntries(
      weeks.map((w: { periodStart: string; netPnl: string }) => [w.periodStart, w.netPnl]),
    );

    // Settimana lun 13/07: 10 (dom sera) + 50 (15/07) + 100 (15/07→16/07 Roma)
    expect(byWeek["2026-07-13"]).toBe("160.00");
    // Il trade invernale sta nella settimana di lun 12/01
    expect(byWeek["2026-01-12"]).toBe("25.00");
    // Nessuna settimana del 6/07: la domenica sera non deve restare indietro
    expect(byWeek["2026-07-06"]).toBeUndefined();
  });
});
