import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeInput } from "@/lib/validations/trade";

/**
 * P0 — modificare un trade dal form cancellava la nota «Piano».
 *
 * Il form di modifica ha UN campo «Note», ma un trade ne porta di tre tipi:
 * il piano (tradePhase PLAN, scritto dalla scheda del trade), la revisione
 * (REVIEW) e le note senza fase (campo unico storico, revisione guidata).
 * La pagina di modifica caricava TUTTE le note TRADE fuse in quel campo, e
 * al salvataggio, se il testo era cambiato, `updateTradeAction` cancellava
 * TUTTE le note TRADE e ne ricreava una senza fase: il piano spariva dalla
 * sua sezione e, se l'utente aveva tolto quel testo dal campo, spariva e basta.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-trade-edit-notes@test.local";

// La server action legge la sessione: qui la sessione è quella dell'utente
// di test, e la cache di Next non esiste fuori dal runtime.
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: session.userId } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PLAN = "Entro sul ritest del massimo di ieri, stop sotto il minimo.";

describe.skipIf(!hasDb)("modifica trade dal form: le note con fase sopravvivono", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let updateTradeAction: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let accountId = "";
  let tradeId = "";

  const input = (notes: string | undefined): TradeInput => ({
    tradingAccountId: accountId,
    symbol: "ES",
    assetClass: "FUTURES",
    pointValue: "50",
    tags: [],
    notes,
    executions: [
      { side: "BUY", quantity: "1", price: "5000", fee: "2", executedAt: "2026-09-01T15:30" },
      { side: "SELL", quantity: "1", price: "5010", fee: "2", executedAt: "2026-09-01T16:00" },
    ],
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ updateTradeAction } = await import("@/server/trades"));

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        timezone: "Europe/Rome",
        tradingAccounts: { create: [{ name: "Conto note", currency: "USD" }] },
      },
      include: { tradingAccounts: true },
    });
    session.userId = user.id;
    accountId = user.tradingAccounts[0].id;
  });

  beforeEach(async () => {
    await prisma.trade.deleteMany({ where: { tradingAccountId: accountId } });
    const trade = await prisma.trade.create({
      data: {
        tradingAccountId: accountId,
        symbol: "ES",
        assetClass: "FUTURES",
        direction: "LONG",
        status: "CLOSED",
        openedAt: new Date("2026-09-01T13:30:00Z"),
        closedAt: new Date("2026-09-01T14:00:00Z"),
        pointValue: "50",
        quantity: "1",
        avgEntryPrice: "5000",
        avgExitPrice: "5010",
        grossPnl: "500",
        fees: "4",
        netPnl: "496",
        notes: {
          create: [
            { userId: session.userId, type: "TRADE", content: "Nota storica." },
            { userId: session.userId, type: "TRADE", tradePhase: "PLAN", content: PLAN },
            {
              userId: session.userId,
              type: "TRADE",
              tradePhase: "REVIEW",
              content: "Uscito troppo presto.",
            },
          ],
        },
      },
    });
    tradeId = trade.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  async function notesByPhase() {
    const notes = await prisma.note.findMany({
      where: { tradeId, type: "TRADE" },
      orderBy: { createdAt: "asc" },
      select: { tradePhase: true, content: true },
    });
    return {
      plan: notes.filter((n: { tradePhase: string | null }) => n.tradePhase === "PLAN"),
      review: notes.filter((n: { tradePhase: string | null }) => n.tradePhase === "REVIEW"),
      free: notes.filter((n: { tradePhase: string | null }) => n.tradePhase === null),
    };
  }

  it("cambiare il testo del campo Note non tocca piano e revisione", async () => {
    const result = await updateTradeAction(tradeId, input("Nota storica, riletta."));
    expect(result).toEqual({ success: true, tradeId });

    const { plan, review, free } = await notesByPhase();
    expect(plan).toEqual([{ tradePhase: "PLAN", content: PLAN }]);
    expect(review).toEqual([{ tradePhase: "REVIEW", content: "Uscito troppo presto." }]);
    expect(free.map((n: { content: string }) => n.content)).toEqual([
      "Nota storica, riletta.",
    ]);
  });

  it("svuotare il campo Note non cancella il piano", async () => {
    await updateTradeAction(tradeId, input(undefined));

    const { plan, review, free } = await notesByPhase();
    expect(plan).toHaveLength(1);
    expect(plan[0].content).toBe(PLAN);
    expect(review).toHaveLength(1);
    expect(free).toHaveLength(0);
  });

  it("salvare senza toccare il campo Note lascia tutte le note come sono", async () => {
    await updateTradeAction(tradeId, input("Nota storica."));

    const { plan, review, free } = await notesByPhase();
    expect(plan).toHaveLength(1);
    expect(review).toHaveLength(1);
    expect(free.map((n: { content: string }) => n.content)).toEqual(["Nota storica."]);
  });
});
