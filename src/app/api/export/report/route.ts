import type { NextRequest } from "next/server";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { toCsv } from "@/lib/csv";
import { isValidDateKey } from "@/lib/calendar";
import { todayKeyInZone, zonedInputToUtc } from "@/lib/dates";
import {
  endOfRange,
  isReportRange,
  previousStart,
  REPORT_RANGE_LABELS,
  reportRangeLabel,
  startOfRange,
  type ReportRange,
} from "@/lib/report-period";
import {
  avgLoss,
  avgWin,
  currentStreak,
  dayStats,
  expectancy,
  payoffRatio,
  profitFactor,
  winRate,
} from "@/lib/metrics";
import {
  getCurrencyBreakdown,
  getDailyPnl,
  getRecentTradeOutcomes,
  getTradeAggregates,
  type StatsFilter,
} from "@/lib/queries/stats";
import {
  getStrategyBreakdown,
  getSymbolBreakdown,
  getTagBreakdown,
} from "@/lib/queries/reports";

/**
 * F5 — CSV del REPORT PERIODICO: i numeri del report, non i trade grezzi.
 *
 * L'export che già esisteva (`/api/export/trades`) serve a portarsi via i
 * dati; questo serve a portarsi via il RENDICONTO — quello che si allega a
 * un messaggio o si incolla in un foglio. Sono due bisogni diversi e due
 * file diversi: una riga per trade non risponde a «com'è andato luglio».
 *
 * FORMATO LUNGO (sezione, voce, valore, unità) e non una riga larga: un
 * report ha sezioni con un numero di righe variabile — i simboli tradati, i
 * tag di errore — e in formato largo diventerebbe una tabella a buchi con
 * colonne che cambiano da un mese all'altro. In formato lungo si filtra per
 * sezione e si fa una pivot in tre clic.
 *
 * Gli stessi numeri della pagina, dalle stesse funzioni: nessun calcolo
 * duplicato qui dentro, altrimenti pagina e CSV finirebbero per divergere.
 */

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const sessionUserId = session.user.id;

  const [user, tradeScope] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUserId },
      select: { timezone: true, baseCurrency: true },
    }),
    resolveTradeScope(sessionUserId),
  ]);
  const userId = tradeScope.userId;
  const accountId = tradeScope.accountId;

  const search = request.nextUrl.searchParams;
  const range: ReportRange = isReportRange(search.get("r"))
    ? (search.get("r") as ReportRange)
    : "settimana";
  const requested = search.get("w");
  const start = startOfRange(
    requested && isValidDateKey(requested)
      ? requested
      : todayKeyInZone(user.timezone),
    range,
  );
  const prevStart = previousStart(start, range);

  const bounds = (fromKey: string) => ({
    from: zonedInputToUtc(`${fromKey}T00:00`, user.timezone),
    to: zonedInputToUtc(`${endOfRange(fromKey, range)}T00:00`, user.timezone),
  });

  // Stessa regola dell'app: mai sommare valute diverse. Lo scope si risolve
  // sull'unione dei due periodi confrontati, come fa la pagina.
  const currencyTotals = await getCurrencyBreakdown({
    userId,
    accountId,
    from: bounds(prevStart).from,
    to: bounds(start).to,
  });
  const scope = resolveCurrencyScope(
    currencyTotals,
    search.get("cur") ?? undefined,
  );
  const currency = scope.active ?? user.baseCurrency;

  const filter: StatsFilter = {
    userId,
    accountId,
    currency: scope.active,
    ...bounds(start),
  };
  const prevFilter: StatsFilter = { ...filter, ...bounds(prevStart) };

  const [agg, prevAgg, daily, outcomes, symbols, strategies, tags] =
    await Promise.all([
      getTradeAggregates(filter),
      getTradeAggregates(prevFilter),
      getDailyPnl(filter, user.timezone),
      getRecentTradeOutcomes(filter),
      getSymbolBreakdown(filter),
      getStrategyBreakdown(filter),
      getTagBreakdown(filter),
    ]);

  const days = dayStats(daily);
  const streak = currentStreak(outcomes);
  const aWin = avgWin(agg.winSum, agg.wins);
  const aLoss = avgLoss(agg.lossSum, agg.losses);
  const rows: string[][] = [["sezione", "voce", "valore", "unita"]];
  const add = (
    section: string,
    label: string,
    value: string | null,
    unit = "",
  ) => rows.push([section, label, value ?? "", unit]);

  add("periodo", "intervallo", REPORT_RANGE_LABELS[range]);
  add("periodo", "etichetta", reportRangeLabel(start, range));
  add("periodo", "dal", start);
  add("periodo", "al escluso", endOfRange(start, range));
  add("periodo", "fuso orario", user.timezone);
  add("periodo", "valuta", currency);

  add("risultato", "trade chiusi", String(agg.total));
  add("risultato", "vincenti", String(agg.wins));
  add("risultato", "perdenti", String(agg.losses));
  add("risultato", "breakeven", String(agg.breakevens));
  add("risultato", "P&L netto", agg.netPnl, currency);
  add("risultato", "fee", agg.fees, currency);
  add("risultato", "win rate", winRate(agg.wins, agg.total), "frazione");
  add("risultato", "profit factor", profitFactor(agg.winSum, agg.lossSum));
  add("risultato", "expectancy", expectancy(agg), currency);
  add("risultato", "vincita media", aWin, currency);
  add("risultato", "perdita media", aLoss, currency);
  add("risultato", "payoff", payoffRatio(aWin, aLoss));
  add("risultato", "miglior trade", agg.bestWin, currency);
  add("risultato", "peggior trade", agg.worstLoss, currency);

  add("confronto", "P&L netto periodo precedente", prevAgg.netPnl, currency);
  add(
    "confronto",
    "delta P&L",
    new Decimal(agg.netPnl).minus(prevAgg.netPnl).toFixed(2),
    currency,
  );
  add(
    "confronto",
    "win rate periodo precedente",
    winRate(prevAgg.wins, prevAgg.total),
    "frazione",
  );

  add("giornate", "giornate operative", String(daily.length));
  add("giornate", "in verde", String(days.posDays));
  add("giornate", "in rosso", String(days.negDays));
  add("giornate", "media giornata positiva", days.avgPosDay, currency);
  add("giornate", "media giornata negativa", days.avgNegDay, currency);
  add("giornate", "migliore", days.bestDay?.netPnl ?? null, currency);
  add("giornate", "giorno migliore", days.bestDay?.day ?? null);
  add("giornate", "peggiore", days.worstDay?.netPnl ?? null, currency);
  add("giornate", "giorno peggiore", days.worstDay?.day ?? null);
  add(
    "streak",
    "serie corrente",
    streak.direction === "NONE" ? "nessuna" : `${streak.length} ${streak.direction}`,
  );

  for (const row of symbols) {
    add("simbolo", row.symbol, row.netPnl, currency);
    add("simbolo", `${row.symbol} · trade`, String(row.total));
  }
  for (const row of strategies) {
    add("strategia", row.name ?? "senza strategia", row.netPnl, currency);
    add("strategia", `${row.name ?? "senza strategia"} · trade`, String(row.total));
  }
  for (const row of tags) {
    add(`tag:${row.category.toLowerCase()}`, row.name, row.netPnl, currency);
    add(`tag:${row.category.toLowerCase()}`, `${row.name} · trade`, String(row.total));
  }

  const filename = `report-${range}-${start}.csv`;
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Un rendiconto si scarica, non si mette in cache condivisa.
      "Cache-Control": "no-store",
    },
  });
}
