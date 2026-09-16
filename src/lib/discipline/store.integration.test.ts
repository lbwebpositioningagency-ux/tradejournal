import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * INTEGRAZIONE su Postgres della configurazione delle regole: salvataggio,
 * sostituzione delle soglie per valuta, ritorno ai valori di partenza, e
 * isolamento fra utenti (le regole di uno non si vedono dall'altro).
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const EMAIL_A = "it-discipline-a@test.local";
const EMAIL_B = "it-discipline-b@test.local";

describe.skipIf(!hasDb)("regole di disciplina su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let store: any;
  let rules: any;
  let schema: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userA = "";
  let userB = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    store = await import("./store");
    rules = await import("@/lib/queries/discipline-rules");
    ({ disciplineRuleSchema: schema } = await import("@/lib/validations/discipline"));
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    userA = (await prisma.user.create({ data: { email: EMAIL_A } })).id;
    userB = (await prisma.user.create({ data: { email: EMAIL_B } })).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
      await prisma.$disconnect();
    }
  });

  const dailyLoss = (currencyLimits: { currency: string; amount: string }[], isActive = true) =>
    schema.parse({
      type: "MAX_DAILY_LOSS",
      isActive,
      rValue: null,
      countValue: null,
      minutesValue: null,
      sessions: [],
      allowWeekend: false,
      currencyLimits,
      symbolLimits: [],
    });

  it("senza configurazione valgono i valori di partenza", async () => {
    const list = await rules.getEffectiveRules(userA);
    const daily = list.find((r: { type: string }) => r.type === "MAX_DAILY_LOSS");
    expect(daily).toMatchObject({ customized: false, isActive: true, currencyLimits: [{ currency: "USD", amount: "1000.00" }] });
  });

  it("salva soglie per valuta e le sostituisce in blocco", async () => {
    await store.saveDisciplineRule(userA, dailyLoss([{ currency: "USD", amount: "800" }, { currency: "EUR", amount: "650,5" }]));
    await store.saveDisciplineRule(userA, dailyLoss([{ currency: "EUR", amount: "600" }], false));
    const daily = (await rules.getEffectiveRules(userA)).find((r: { type: string }) => r.type === "MAX_DAILY_LOSS");
    expect(daily).toMatchObject({ customized: true, isActive: false, currencyLimits: [{ currency: "EUR", amount: "600.00" }] });
    expect(await prisma.disciplineRuleCurrencyLimit.count({ where: { rule: { userId: userA } } })).toBe(1);
  });

  it("le regole di un utente non toccano l'altro", async () => {
    const daily = (await rules.getEffectiveRules(userB)).find((r: { type: string }) => r.type === "MAX_DAILY_LOSS");
    expect(daily.customized).toBe(false);
  });

  it("ritorno ai valori di partenza: riga e soglie cancellate", async () => {
    await store.resetDisciplineRule(userA, "MAX_DAILY_LOSS");
    expect(await prisma.disciplineRule.count({ where: { userId: userA } })).toBe(0);
    expect(await prisma.disciplineRuleCurrencyLimit.count({ where: { rule: { userId: userA } } })).toBe(0);
  });
});
