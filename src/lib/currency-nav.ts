import Decimal from "decimal.js";
import type { CurrencyTotal } from "@/lib/queries/stats";
import { profitFactor, winRate } from "@/lib/metrics";
import { formatPercent, formatProfitFactor, formatSignedMoney } from "@/lib/money";

/**
 * VALUTA NELLA NAVIGAZIONE E NEI TOTALI — regola F6 applicata ai punti in cui
 * si perdeva.
 *
 * Il difetto era sempre lo stesso in due forme: una somma di `netPnl` su trade
 * di conti con valute diverse (100 USD + 100 EUR = «200», un numero senza
 * unità presentato come valido), oppure un link che non portava con sé `?cur`
 * e faceva atterrare su una pagina che, senza la valuta, ne sceglieva un'altra
 * o le sommava. Qui stanno i due rimedi, puri e testati.
 */

/**
 * Aggiunge (o sostituisce) `cur` alla query di un href interno. Senza valuta
 * l'href torna identico: con un conto a valuta unica non serve scriverla.
 */
export function withCurrencyParam(href: string, currency?: string | null): string {
  if (!currency) return href;
  const [pathAndQuery, hash = ""] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.set("cur", currency);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export interface CurrencyDayStats {
  currency: string;
  trades: number;
  wins: number;
  losses: number;
  net: string;
  winSum: string;
  lossSum: string;
}

/**
 * Statistiche di un insieme di trade SEPARATE PER VALUTA, nell'ordine in cui
 * le valute compaiono. Mai un totale comune: chi ne vuole uno sceglie una
 * valuta.
 */
export function statsByCurrency(
  trades: { netPnl: string; currency: string }[],
): CurrencyDayStats[] {
  const acc = new Map<
    string,
    { trades: number; wins: number; losses: number; net: Decimal; winSum: Decimal; lossSum: Decimal }
  >();
  for (const t of trades) {
    const row =
      acc.get(t.currency) ??
      { trades: 0, wins: 0, losses: 0, net: new Decimal(0), winSum: new Decimal(0), lossSum: new Decimal(0) };
    const pnl = new Decimal(t.netPnl);
    row.trades += 1;
    row.net = row.net.plus(pnl);
    if (pnl.gt(0)) {
      row.wins += 1;
      row.winSum = row.winSum.plus(pnl);
    } else if (pnl.lt(0)) {
      row.losses += 1;
      row.lossSum = row.lossSum.plus(pnl);
    }
    acc.set(t.currency, row);
  }
  return [...acc.entries()].map(([currency, r]) => ({
    currency,
    trades: r.trades,
    wins: r.wins,
    losses: r.losses,
    net: r.net.toFixed(2),
    winSum: r.winSum.toFixed(2),
    lossSum: r.lossSum.toFixed(2),
  }));
}

/**
 * Riga «Bilancio» del Post-Market precompilato dalla revisione guidata. Con
 * trade in più valute scrive una riga per valuta: la revisione mostra TUTTI i
 * trade del giorno (classificarli non somma denaro), ma il bilancio in denaro
 * non può mettere insieme euro e dollari.
 */
export function reviewBalanceLines(
  trades: { netPnl: string; currency: string }[],
): string[] {
  const groups = statsByCurrency(trades);
  const multi = groups.length > 1;
  return groups.map((g) => {
    const pf = profitFactor(g.winSum, g.lossSum);
    const label = multi ? `Bilancio ${g.currency}` : "Bilancio";
    return `${label}: ${formatSignedMoney(g.net, g.currency)} · ${g.trades} trade (${g.wins}W/${g.losses}L) · Win ${formatPercent(winRate(g.wins, g.trades))} · PF ${formatProfitFactor(pf, g.wins)}`;
  });
}

/**
 * Valute di riserva quando lo scope non ha trade chiusi: le valute dei CONTI
 * considerati, con zero trade. Senza di loro lo scope resta senza valuta e le
 * query che sommano i saldi iniziali (`getStartingBalance`) mettono insieme
 * conti in euro e in dollari. Ordine: valuta con più conti prima, poi
 * alfabetico — la stessa forma di `getCurrencyBreakdown`.
 */
export function accountCurrencyTotals(accounts: { currency: string }[]): CurrencyTotal[] {
  const counts = new Map<string, number>();
  for (const a of accounts) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([currency]) => ({ currency, netPnl: "0", trades: 0 }));
}

/**
 * Totali per valuta dai conti con il conteggio dei loro trade (una riga per
 * conto): la forma di `getCurrencyBreakdown` per una query Prisma che non passa
 * dal SQL grezzo, come la sequenza della Trade View.
 */
export function currencyTotalsFromAccounts(
  accounts: { currency: string; trades: number }[],
): CurrencyTotal[] {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    if (a.trades === 0) continue;
    counts.set(a.currency, (counts.get(a.currency) ?? 0) + a.trades);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([currency, trades]) => ({ currency, netPnl: "0", trades }));
}
