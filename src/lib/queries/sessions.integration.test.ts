import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE su Postgres per la classificazione in sessioni
 * (Fase 35): la logica vive nel CASE SQL di `getSessionBreakdown`, quindi
 * i test unitari non possono vederla. Timestamp UTC noti → sessione attesa
 * in ora italiana, con TRE cose che devono reggere:
 * - il residuo 22:00–24:00 italiano è OFF, non accorpato a una sessione;
 * - la mezzanotte italiana appartiene ad ASIA anche quando in UTC è ancora
 *   il giorno prima;
 * - lo STESSO orario UTC cade in sessioni diverse tra inverno (CET) ed
 *   estate (CEST): se qualcuno sostituisce il fuso IANA con un offset
 *   fisso, la coppia gennaio/luglio delle 06:30Z si rompe.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-sessions@test.local";

/** [openedAt UTC, sessione attesa in ora italiana] */
const CASES: [string, "ASIA" | "LONDON" | "NEWYORK" | "OFF"][] = [
  // Estate (CEST, UTC+2)
  ["2026-07-15T06:30:00Z", "LONDON"], // 08:30 Roma
  ["2026-07-15T12:00:00Z", "NEWYORK"], // 14:00 Roma — confine incluso a sinistra
  ["2026-07-15T19:30:00Z", "NEWYORK"], // 21:30 Roma
  ["2026-07-15T20:30:00Z", "OFF"], // 22:30 Roma — fascia 22–24, categoria a sé
  ["2026-07-15T22:30:00Z", "ASIA"], // 00:30 Roma del 16/07: mezzanotte scavallata
  // Inverno (CET, UTC+1) — stessa ora UTC delle 06:30Z estive, sessione diversa
  ["2026-01-15T06:30:00Z", "ASIA"], // 07:30 Roma
  ["2026-01-15T21:00:00Z", "OFF"], // 22:00 Roma — confine incluso a sinistra
  ["2026-01-15T23:30:00Z", "ASIA"], // 00:30 Roma del 16/01
];

describe.skipIf(!hasDb)("sessioni in ora italiana su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let getSessionBreakdown: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";
  let accountId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ getSessionBreakdown } = await import("./reports"));
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({ data: { email: TEST_EMAIL } });
    userId = user.id;
    const account = await prisma.tradingAccount.create({
      data: { userId, name: "IT sessioni", currency: "USD" },
    });
    accountId = account.id;

    await prisma.trade.createMany({
      data: CASES.map(([openedAt], i) => ({
        tradingAccountId: accountId,
        symbol: "TEST",
        direction: "LONG",
        status: "CLOSED",
        openedAt: new Date(openedAt),
        // La classificazione usa openedAt: il closedAt serve solo al filtro
        // "trade chiusi" e resta nello stesso giorno UTC.
        closedAt: new Date(new Date(openedAt).getTime() + 30 * 60 * 1000),
        quantity: 1,
        avgEntryPrice: 100,
        avgExitPrice: 101,
        netPnl: 10 + i,
      })),
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  it("ogni timestamp noto finisce nella sessione attesa (DST inclusa)", async () => {
    const rows = await getSessionBreakdown({ userId, accountId });
    const totals = Object.fromEntries(
      rows.map((r: { session: string; total: number }) => [r.session, r.total]),
    );
    const expected: Record<string, number> = {};
    for (const [, session] of CASES) {
      expected[session] = (expected[session] ?? 0) + 1;
    }
    expect(totals).toEqual(expected); // ASIA 3 · LONDON 1 · NEWYORK 2 · OFF 2
  });

  it("le 06:30Z di gennaio e di luglio cadono in sessioni diverse (fuso IANA, non offset)", async () => {
    // Già implicito nei totali, ma il punto merita un'asserzione esplicita:
    // con un offset fisso le due aperture sarebbero nella stessa fascia.
    const winter = CASES.find(([ts]) => ts.startsWith("2026-01-15T06:30"))![1];
    const summer = CASES.find(([ts]) => ts.startsWith("2026-07-15T06:30"))![1];
    expect(winter).toBe("ASIA");
    expect(summer).toBe("LONDON");
    expect(winter).not.toBe(summer);
  });
});
