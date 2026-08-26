import type { NextRequest } from "next/server";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import {
  buildPdf,
  PAGE,
  PDF_INK,
  PdfPage,
  type PdfColor,
} from "@/lib/pdf";
import { isValidDateKey } from "@/lib/calendar";
import { todayKeyInZone, zonedInputToUtc } from "@/lib/dates";
import {
  endOfRange,
  isReportRange,
  previousStart,
  REPORT_PREVIOUS_LABELS,
  REPORT_RANGE_LABELS,
  reportRangeLabel,
  startOfRange,
  type ReportRange,
} from "@/lib/report-period";
import {
  formatMoney,
  formatPercent,
  formatProfitFactor,
  formatRatio,
  formatSignedMoney,
} from "@/lib/money";
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
 * EXPORT PDF del REPORT PERIODICO — un file, non una finestra di stampa.
 *
 * `window.print()` resta dov'era, per chi vuole l'anteprima; questo produce
 * un documento: stessa uscita su ogni macchina, indipendente da browser e
 * impostazioni di margine, con un nome file deterministico da allegare a un
 * messaggio senza aprire una pagina. Impaginato a mano su `lib/pdf.ts`,
 * zero dipendenze.
 *
 * Gli stessi numeri della pagina e del CSV, dalle stesse funzioni: tre
 * uscite, una sola fonte di verità.
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

  const money = (value: string | null) =>
    value === null ? "—" : formatSignedMoney(value, currency);
  const tone = (value: string | null): PdfColor =>
    value === null || new Decimal(value).isZero()
      ? PDF_INK.text
      : new Decimal(value).gt(0)
        ? PDF_INK.profit
        : PDF_INK.loss;

  const page = new PdfPage();
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const width = right - left;
  let y = PAGE.height - PAGE.margin;

  /** Titolo di sezione con il suo righello: la struttura si vede. */
  const section = (label: string) => {
    y -= 26;
    page.text(label.toUpperCase(), left, y, {
      size: 8,
      font: "Helvetica-Bold",
      color: PDF_INK.muted,
    });
    y -= 6;
    page.rule(left, y, width);
    y -= 4;
  };

  /** Riga voce/valore, valore allineato a destra. */
  const row = (label: string, value: string, color: PdfColor = PDF_INK.text) => {
    y -= 15;
    page.text(label, left, y, { size: 10, color: PDF_INK.muted });
    page.text(value, right, y, { size: 10, align: "right", color });
  };

  // ── Testata ───────────────────────────────────────────────────────────
  page.text("L&B TradingSpace", left, y, {
    size: 9,
    font: "Helvetica-Bold",
    color: PDF_INK.muted,
  });
  y -= 26;
  page.text(
    `${REPORT_RANGE_LABELS[range]} ${reportRangeLabel(start, range)}`,
    left,
    y,
    { size: 20, font: "Helvetica-Bold" },
  );
  y -= 14;
  page.text(
    `dal ${start} al ${endOfRange(start, range)} escluso · fuso ${user.timezone} · ${currency}`,
    left,
    y,
    { size: 9, color: PDF_INK.muted },
  );

  // ── Risultato ─────────────────────────────────────────────────────────
  section("Risultato");
  row("P&L netto", money(agg.netPnl), tone(agg.netPnl));
  row(
    "Trade chiusi",
    `${agg.total} (${agg.wins}W / ${agg.losses}L${agg.breakevens > 0 ? ` / ${agg.breakevens}BE` : ""})`,
  );
  const wr = winRate(agg.wins, agg.total);
  row("Win rate", wr === null ? "—" : formatPercent(wr));
  row("Profit factor", formatProfitFactor(profitFactor(agg.winSum, agg.lossSum), agg.wins));
  const exp = expectancy(agg);
  row("Attesa per trade", exp === null ? "—" : money(exp), tone(exp));
  // `avgWin`/`avgLoss` sono GRANDEZZE positive per contratto: passarle al
  // formatter col segno metterebbe un "+" davanti a una perdita media.
  row(
    "Vincita media",
    aWin === null ? "—" : formatMoney(aWin, currency),
    PDF_INK.profit,
  );
  row(
    "Perdita media",
    aLoss === null ? "—" : formatMoney(aLoss, currency),
    PDF_INK.loss,
  );
  row("Payoff", formatRatio(payoffRatio(aWin, aLoss)));
  row("Fee", formatMoney(agg.fees, currency));

  // ── Confronto col periodo precedente ──────────────────────────────────
  section(`Confronto con ${REPORT_PREVIOUS_LABELS[range]}`);
  const delta = new Decimal(agg.netPnl).minus(prevAgg.netPnl).toFixed(2);
  row("P&L netto precedente", money(prevAgg.netPnl), tone(prevAgg.netPnl));
  row("Differenza", money(delta), tone(delta));
  const prevWr = winRate(prevAgg.wins, prevAgg.total);
  row(
    "Win rate precedente",
    prevWr === null ? "— (nessun trade)" : formatPercent(prevWr),
  );

  // ── Giornate ──────────────────────────────────────────────────────────
  section("Giornate operative");
  row("Giornate con trade", String(daily.length));
  row("In verde / in rosso", `${days.posDays} / ${days.negDays}`);
  if (days.bestDay) {
    row(`Migliore (${days.bestDay.day})`, money(days.bestDay.netPnl), PDF_INK.profit);
  }
  if (days.worstDay) {
    row(`Peggiore (${days.worstDay.day})`, money(days.worstDay.netPnl), PDF_INK.loss);
  }
  row(
    "Serie corrente",
    streak.direction === "NONE"
      ? "nessuna"
      : `${streak.length} ${streak.direction === "WIN" ? "in win" : "in loss"}`,
  );

  // ── Per simbolo ───────────────────────────────────────────────────────
  if (symbols.length > 0) {
    section("Per simbolo");
    for (const symbol of symbols.slice(0, 8)) {
      row(`${symbol.symbol} · ${symbol.total} trade`, money(symbol.netPnl), tone(symbol.netPnl));
    }
  }

  // ── Per strategia ─────────────────────────────────────────────────────
  const namedStrategies = strategies.filter((s) => s.total > 0);
  if (namedStrategies.length > 0) {
    section("Per strategia");
    for (const strategy of namedStrategies.slice(0, 8)) {
      row(
        `${strategy.name ?? "Senza strategia"} · ${strategy.total} trade`,
        money(strategy.netPnl),
        tone(strategy.netPnl),
      );
    }
  }

  // ── Errori taggati ────────────────────────────────────────────────────
  const mistakes = tags.filter((t) => t.category === "MISTAKE");
  if (mistakes.length > 0) {
    section("Errori taggati e loro costo");
    for (const tag of mistakes.slice(0, 8)) {
      row(`${tag.name} · ${tag.total} trade`, money(tag.netPnl), tone(tag.netPnl));
    }
  }

  // ── Piede ─────────────────────────────────────────────────────────────
  page.rule(left, PAGE.margin + 26, width);
  page.text(
    "Generato dalle stesse formule testate dell'app: nessuna stima, nessuna AI. Ogni numero è riconciliabile con i Reports.",
    left,
    PAGE.margin + 14,
    { size: 7.5, color: PDF_INK.muted },
  );
  page.text(
    `Conto: ${scope.active ?? user.baseCurrency} · documento generato dall'applicazione`,
    left,
    PAGE.margin + 4,
    { size: 7.5, color: PDF_INK.muted },
  );

  const pdf = buildPdf(
    page,
    `Report ${REPORT_RANGE_LABELS[range]} ${reportRangeLabel(start, range)}`,
  );
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${range}-${start}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
