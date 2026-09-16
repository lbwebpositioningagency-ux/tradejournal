import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * GOLDEN su SIM1 (dataset deterministico): con le regole di partenza il
 * punteggio si popola e i numeri sono noti. Misurati il 16/09/2026 e riportati
 * nel resoconto del Progress Tracker. «Stop presente» e «Trade al giorno»
 * al 100% sono la ragione dell'avviso in pagina.
 * Si salta se il database non ha il conto SIM1 (seed `db:seed:sim1`).
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Progress Tracker su SIM1", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let evaluations: any[] = [];
  let evaluate: any;
  let present = false;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const sim1 = await prisma.tradingAccount.findFirst({ where: { isDemo: true }, select: { id: true, userId: true } });
    if (!sim1) return;
    present = true;
    const { getDisciplineDayFacts } = await import("./discipline");
    const { effectiveRules } = await import("@/lib/discipline/catalog");
    evaluate = await import("@/lib/discipline/evaluate");
    const facts = await getDisciplineDayFacts({ userId: sim1.userId, accountId: sim1.id, currency: "USD", timezone: "Europe/Rome" });
    evaluations = evaluate.evaluateDays(facts, effectiveRules([]), "USD");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("il punteggio del periodo si popola con i numeri noti", ({ skip }) => {
    if (!present) skip();
    expect(evaluate.summarizePeriod(evaluations)).toMatchObject({
      days: 374,
      respected: 1578,
      applicable: 1640,
      score: "0.962195",
      perfectDays: 325,
      reliable: true,
    });
  });

  it("stop presente e trade al giorno al 100% per costruzione; le regole sulle perdite no", ({ skip }) => {
    if (!present) skip();
    const rate = (t: string) => evaluate.ruleStats(t, evaluations);
    expect(rate("STOP_PRESENT")).toMatchObject({ violatedDays: 0, followRate: "1.000000" });
    expect(rate("MAX_TRADES_PER_DAY")).toMatchObject({ violatedDays: 0, followRate: "1.000000" });
    expect(rate("STOP_RESPECTED").violatedDays).toBe(29);
    expect(rate("MAX_LOSS_PER_TRADE").violatedDays).toBe(14);
    expect(rate("MAX_DAILY_LOSS").violatedDays).toBe(19);
  });
});
