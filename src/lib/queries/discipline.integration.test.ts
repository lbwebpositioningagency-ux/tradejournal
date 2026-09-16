import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * INTEGRAZIONE su Postgres dei fatti giornalieri della disciplina: trade
 * costruiti a mano che rispettano e violano ciascuna regola, poi il punteggio
 * calcolato con le soglie di partenza. Fuso Europe/Rome, luglio (UTC+2).
 *
 * Lunedì 6 luglio 2026 (ora di Roma):
 *  T1 09:00→09:30 LONG ES ×2, ingresso 100, stop 95, uscita 94 = −1,2R,
 *     netto −600, rischio 500, target R 2. Perdita oltre la tolleranza.
 *  T2 09:40→10:00 senza stop, netto −50: aperto 10 minuti dopo la perdita
 *     di T1, stop mancante, seconda perdita di fila.
 *  T3 23:00 (fuori sessione) → martedì 01:00, netto +200, target R 0,5.
 *  T4 09:10→09:20 EUR (altra valuta), netto −5.000: non deve entrare nei
 *     fatti in USD.
 * Sabato 11 luglio: T5 10:00→10:30 aperto nel weekend, netto +10, ×3 contratti
 *     mentre T6 è ancora aperta (posizione mai chiusa, aperta alle 09:55).
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-discipline-facts@test.local";

describe.skipIf(!hasDb)("fatti giornalieri della disciplina su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let facts: any[] = [];
  let factsEur: any[] = [];
  let evaluate: any;
  let catalog: any;
  let plan: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { getDisciplineDayFacts } = await import("./discipline");
    evaluate = await import("@/lib/discipline/evaluate");
    catalog = await import("@/lib/discipline/catalog");
    plan = await import("@/lib/metrics/plan");
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        tradingAccounts: {
          create: [
            { name: "USD", currency: "USD" },
            { name: "EUR", currency: "EUR" },
          ],
        },
      },
      include: { tradingAccounts: true },
    });
    const usd = user.tradingAccounts.find((a: { currency: string }) => a.currency === "USD").id;
    const eur = user.tradingAccounts.find((a: { currency: string }) => a.currency === "EUR").id;

    const base = {
      symbol: "ES",
      direction: "LONG",
      pointValue: "50",
      quantity: "1",
      avgEntryPrice: "100",
      status: "CLOSED",
    };
    await prisma.trade.createMany({
      data: [
        {
          ...base, tradingAccountId: usd, quantity: "2",
          openedAt: new Date("2026-07-06T07:00:00Z"), closedAt: new Date("2026-07-06T07:30:00Z"),
          plannedStop: "95", plannedTarget: "110", targetR: "2", initialRisk: "500.00",
          avgExitPrice: "94", grossPnl: "-600", netPnl: "-600.00",
        },
        {
          ...base, tradingAccountId: usd,
          openedAt: new Date("2026-07-06T07:40:00Z"), closedAt: new Date("2026-07-06T08:00:00Z"),
          avgExitPrice: "99", grossPnl: "-50", netPnl: "-50.00",
        },
        {
          ...base, tradingAccountId: usd,
          openedAt: new Date("2026-07-06T21:00:00Z"), closedAt: new Date("2026-07-06T23:00:00Z"),
          plannedStop: "96", plannedTarget: "102", targetR: "0.5", initialRisk: "200.00",
          avgExitPrice: "104", grossPnl: "200", netPnl: "200.00",
        },
        {
          ...base, tradingAccountId: eur, symbol: "DAX",
          openedAt: new Date("2026-07-06T07:10:00Z"), closedAt: new Date("2026-07-06T07:20:00Z"),
          plannedStop: "90", initialRisk: "100.00", avgExitPrice: "50", grossPnl: "-5000", netPnl: "-5000.00",
        },
        {
          ...base, tradingAccountId: usd, quantity: "3",
          openedAt: new Date("2026-07-11T08:00:00Z"), closedAt: new Date("2026-07-11T08:30:00Z"),
          plannedStop: "99", initialRisk: "150.00", avgExitPrice: "100.2", grossPnl: "10", netPnl: "10.00",
        },
        {
          ...base, tradingAccountId: usd, status: "OPEN",
          openedAt: new Date("2026-07-11T07:55:00Z"), closedAt: null,
          plannedStop: "99", initialRisk: "50.00",
        },
      ],
    });

    const { ALL_ACCOUNTS } = await import("@/lib/constants");
    const scope = { userId: user.id, accountId: ALL_ACCOUNTS, timezone: "Europe/Rome" };
    facts = await getDisciplineDayFacts({ ...scope, currency: "USD" });
    factsEur = await getDisciplineDayFacts({ ...scope, currency: "EUR" });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  const day = (key: string) => facts.find((f) => f.day === key);

  it("tre giornate in USD: lunedì, martedì (chiusura overnight), sabato", () => {
    expect(facts.map((f) => f.day)).toEqual(["2026-07-06", "2026-07-07", "2026-07-11"]);
  });

  it("lunedì, giorno di apertura: stop mancante, rischio, R/R, sessioni, pausa", () => {
    expect(day("2026-07-06")).toMatchObject({
      opened: 3,
      missingStop: 1,
      maxPlannedRisk: "500.00",
      openedBySession: { ASIA: 0, LONDON: 2, NEWYORK: 0, OFF: 1 },
      lossBeforeOpenSameDay: true,
      maxOpenPositions: 1,
      maxQuantityBySymbol: { ES: "2.00000000" },
    });
    expect(Number(day("2026-07-06").minTargetR)).toBe(0.5);
    expect(Number(day("2026-07-06").minMinutesAfterLoss)).toBe(10);
  });

  it("lunedì, giorno di chiusura: somma, peggiore, perdita oltre lo stop, serie di perdite", () => {
    expect(day("2026-07-06")).toMatchObject({
      closed: 2,
      netPnl: "-650.00",
      worstTradeNet: "-600.00",
      lossesWithStop: 1,
      maxConsecutiveLosses: 2,
    });
    // Stessa formula di metrics/plan.ts, calcolata in SQL.
    const ts = plan.planVsOutcome({ direction: "LONG", entry: "100", exit: "94", plannedStop: "95", plannedTarget: "110" });
    expect(Number(day("2026-07-06").worstLossPriceR)).toBe(Number(ts.realizedPriceR));
    expect(ts.stopViolated).toBe(true);
  });

  it("il trade overnight si chiude martedì: martedì ha solo una chiusura in utile", () => {
    expect(day("2026-07-07")).toMatchObject({ opened: 0, closed: 1, netPnl: "200.00", lossesWithStop: 0, maxConsecutiveLosses: 0 });
  });

  it("sabato: posizione ancora aperta conta nelle posizioni insieme e nelle aperture", () => {
    expect(day("2026-07-11")).toMatchObject({ opened: 2, closed: 1, maxOpenPositions: 2, lossBeforeOpenSameDay: false });
    // L'ultima perdita è di lunedì: 7.195 minuti prima, lontana da ogni pausa.
    expect(Number(day("2026-07-11").minMinutesAfterLoss)).toBe(7195);
  });

  it("la valuta EUR resta separata: mai sommata ai fatti in USD", () => {
    expect(factsEur.map((f) => f.day)).toEqual(["2026-07-06"]);
    expect(factsEur[0]).toMatchObject({ netPnl: "-5000.00", opened: 1 });
    expect(day("2026-07-06").netPnl).toBe("-650.00");
  });

  it("punteggio con TUTTE le regole attive e le soglie di partenza", () => {
    const rules = catalog.effectiveRules([]).map((r: object) => ({ ...r, isActive: true }));
    const days = evaluate.evaluateDays(facts, rules, "USD");
    const monday = days.find((d: { day: string }) => d.day === "2026-07-06");
    expect(monday.results).toEqual({
      STOP_PRESENT: "violated",
      STOP_RESPECTED: "violated", // −1,2R oltre la tolleranza di 0,1R
      MAX_LOSS_PER_TRADE: "respected", // −600 ≤ 700
      MAX_DAILY_LOSS: "respected", // −650 ≤ 1.000
      MAX_TRADES_PER_DAY: "respected", // 3 ≤ 5
      MAX_PLANNED_RISK: "respected", // 500 ≤ 500
      MIN_TARGET_R: "violated", // 0,5 < 1
      TRADING_HOURS: "violated", // T3 alle 23:00
      COOLDOWN_AFTER_LOSS: "violated", // 10 < 15 minuti
      MAX_CONSECUTIVE_LOSSES: "respected", // 2 ≤ 3
      MAX_OPEN_POSITIONS: "respected",
      MAX_QUANTITY_PER_SYMBOL: "na", // nessun simbolo con soglia
    });
    expect([monday.respected, monday.applicable]).toEqual([6, 11]);

    const tuesday = days.find((d: { day: string }) => d.day === "2026-07-07");
    expect(tuesday.results.STOP_RESPECTED).toBe("na"); // solo utile: non applicabile
    expect(tuesday.results.MAX_TRADES_PER_DAY).toBe("na"); // nessuna apertura

    const saturday = days.find((d: { day: string }) => d.day === "2026-07-11");
    expect(saturday.results.TRADING_HOURS).toBe("violated"); // weekend
    expect(saturday.results.COOLDOWN_AFTER_LOSS).toBe("na");
  });
});
