import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import Decimal from "decimal.js";

/**
 * Test di INTEGRAZIONE del rolling su dati reali (conto demo SIM1).
 *
 * La finestra mobile è l'unico calcolo di questa fase che vive in SQL
 * (`ROWS BETWEEN n-1 PRECEDING AND CURRENT ROW`): i test unitari non possono
 * vederlo. Qui si confronta la finestra prodotta dal database con la STESSA
 * finestra ricalcolata in TypeScript sui trade grezzi — se qualcuno tocca il
 * frame, l'ordinamento o i filtri, questo test cade.
 *
 * Si salta senza DATABASE_URL o senza il conto SIM1 (ambienti puliti).
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const ROME = "Europe/Rome";
const WINDOW = 30;

describe.skipIf(!hasDb)("rolling metrics su dati reali", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let getRollingTradeWindow: any;
  let getDailyPnl: any;
  let getStartingBalance: any;
  let dailyReturns: any;
  let rollingRatios: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let filter: { userId: string; accountId: string } | null = null;
  let trades: { netPnl: string; rMultiple: string | null }[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ getRollingTradeWindow } = await import("./analytics"));
    ({ getDailyPnl, getStartingBalance } = await import("./stats"));
    ({ dailyReturns, rollingRatios } = await import("@/lib/metrics/rolling"));

    const account = await prisma.tradingAccount.findFirst({
      where: { name: "SIM1" },
      select: { id: true, userId: true },
    });
    if (!account) return;
    filter = { userId: account.userId, accountId: account.id };

    const rows = await prisma.trade.findMany({
      where: { tradingAccountId: account.id, status: "CLOSED" },
      orderBy: [{ closedAt: "asc" }, { id: "asc" }],
      select: { netPnl: true, rMultiple: true },
    });
    trades = rows.map((t: { netPnl: unknown; rMultiple: unknown }) => ({
      netPnl: String(t.netPnl),
      rMultiple: t.rMultiple === null ? null : String(t.rMultiple),
    }));
  });

  it("la finestra SQL coincide con la stessa finestra ricalcolata in TS", async () => {
    if (!filter || trades.length < WINDOW) return;

    const rows = await getRollingTradeWindow(filter, ROME, WINDOW);
    const last = rows[rows.length - 1];

    // L'ultimo punto copre gli ultimi WINDOW trade dello storico.
    expect(last.idx).toBe(trades.length);
    const slice = trades.slice(trades.length - WINDOW);

    const wins = slice.filter((t) => new Decimal(t.netPnl).gt(0)).length;
    const losses = slice.filter((t) => new Decimal(t.netPnl).lt(0)).length;
    const netPnl = slice.reduce(
      (acc, t) => acc.plus(t.netPnl),
      new Decimal(0),
    );
    const rSum = slice.reduce(
      (acc, t) => (t.rMultiple === null ? acc : acc.plus(t.rMultiple)),
      new Decimal(0),
    );

    expect(last.total).toBe(WINDOW);
    expect(last.wins).toBe(wins);
    expect(last.losses).toBe(losses);
    expect(new Decimal(last.netPnl).toFixed(2)).toBe(netPnl.toFixed(2));
    expect(new Decimal(last.rSum).toFixed(4)).toBe(rSum.toFixed(4));
    expect(last.rCount).toBe(
      slice.filter((t) => t.rMultiple !== null).length,
    );
  });

  it("solo finestre piene, indici crescenti e ultimo punto sempre presente", async () => {
    if (!filter || trades.length < WINDOW) return;

    const rows = await getRollingTradeWindow(filter, ROME, WINDOW);
    expect(rows.length).toBeGreaterThan(0);
    // Nessun punto parziale: i primi WINDOW-1 trade non producono finestre.
    expect(rows.every((r: { total: number }) => r.total === WINDOW)).toBe(true);
    expect(rows[0].idx).toBeGreaterThanOrEqual(WINDOW);
    const indices = rows.map((r: { idx: number }) => r.idx);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it("il campionamento non perde MAI l'ultimo punto, anche con limite basso", async () => {
    if (!filter || trades.length < WINDOW) return;

    const full = await getRollingTradeWindow(filter, ROME, WINDOW);
    const sampled = await getRollingTradeWindow(filter, ROME, WINDOW, 10);
    expect(sampled.length).toBeLessThan(full.length);
    expect(sampled[sampled.length - 1].idx).toBe(full[full.length - 1].idx);
  });

  it("i ritorni giornalieri coprono le sedute e alimentano una finestra a 252", async () => {
    if (!filter) return;

    const [days, balance] = await Promise.all([
      getDailyPnl(filter, ROME),
      getStartingBalance(filter),
    ]);
    const series = dailyReturns(days, balance);

    // Le giornate operative sono un sottoinsieme delle sedute riempite.
    expect(series.length).toBeGreaterThan(days.length);
    expect(series.every((d: { ret: string | null }) => d.ret !== null)).toBe(true);

    const points = rollingRatios(series, 252);
    expect(points.length).toBe(series.length - 252 + 1);
    // Su uno storico reale la deviazione non è mai nulla: i valori esistono.
    expect(points.every((p: { sharpe: string | null }) => p.sharpe !== null)).toBe(
      true,
    );
  });
});
