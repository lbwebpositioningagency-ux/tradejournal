import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { guardedPgAdapter } from "../src/lib/db-guard";
import { dailyReturns } from "../src/lib/metrics/daily-series";
import { sortinoRatio } from "../src/lib/metrics/sortino";
import { sharpeRatio } from "../src/lib/metrics/sharpe";
import { maxDrawdown } from "../src/lib/metrics/drawdown";
import { ulcerIndex } from "../src/lib/metrics/ulcer";

/**
 * MISURA DEI CONTI DEMO — sonda di sola lettura, per il prima/dopo del seed.
 *
 * Usa gli STESSI moduli di metrica dell'app: se il numero qui non coincide
 * con quello a schermo, il difetto è in questa sonda e non nei dati. In
 * particolare la serie giornaliera è `dailyReturns`, l'unica del progetto
 * (regola in AGENTS.md), col P&L bucketato nel fuso dell'utente con la
 * doppia conversione `AT TIME ZONE`, esattamente come `queries/stats.ts`.
 *
 * Le sedute FANTASMA — chiusure che nel fuso dell'utente cadono di sabato o
 * domenica — sono contate a parte: sono il difetto che questa rigenerazione
 * doveva togliere, e vanno viste per conto e non solo in aggregato.
 */

const adapter = guardedPgAdapter("sonda metriche demo (sola lettura)");
const prisma = new PrismaClient({ adapter });

interface Riga {
  conto: string;
  trade: number;
  sedute: number;
  seduteFantasma: number;
  tradeFantasma: number;
  giorniNegativi: string;
  winRate: string;
  sortino: string;
  sharpe: string;
  maxDD: string;
  ulcer: string;
}

function pct(parte: number, totale: number): string {
  return totale === 0 ? "—" : `${((parte / totale) * 100).toFixed(1)}%`;
}

async function main() {
  const conti = await prisma.tradingAccount.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, initialBalance: true },
  });

  const righe: Riga[] = [];
  for (const conto of conti) {
    /* Stessa doppia conversione delle query dell'app: il giorno di
       competenza è quello di CHIUSURA nel fuso dell'utente. */
    const giorni = await prisma.$queryRaw<{ day: string; net: string }[]>`
      SELECT to_char(("closedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS day,
             SUM("netPnl")::text AS net
      FROM "Trade"
      WHERE "tradingAccountId" = ${conto.id} AND "closedAt" IS NOT NULL
      GROUP BY 1 ORDER BY 1
    `;
    if (giorni.length === 0) continue;

    const fantasma = await prisma.$queryRaw<{ n: bigint; giorni: bigint }[]>`
      SELECT COUNT(*)::bigint AS n,
             COUNT(DISTINCT to_char(("closedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD'))::bigint AS giorni
      FROM "Trade"
      WHERE "tradingAccountId" = ${conto.id} AND "closedAt" IS NOT NULL
        AND EXTRACT(ISODOW FROM (("closedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')) > 5
    `;

    const esiti = await prisma.$queryRaw<{ tot: bigint; vinti: bigint }[]>`
      SELECT COUNT(*)::bigint AS tot,
             COUNT(*) FILTER (WHERE "netPnl" > 0)::bigint AS vinti
      FROM "Trade"
      WHERE "tradingAccountId" = ${conto.id} AND "closedAt" IS NOT NULL
    `;

    const serie = dailyReturns(
      giorni.map((g) => ({ day: g.day, netPnl: g.net })),
      conto.initialBalance.toString(),
    );
    const negativi = serie.filter((s) => Number(s.netPnl) < 0).length;
    const perDrawdown = serie.map((s) => ({ day: s.day, netPnl: s.netPnl }));
    const saldo = conto.initialBalance.toString();
    const dd = maxDrawdown(perDrawdown, saldo);

    righe.push({
      conto: conto.name,
      trade: Number(esiti[0].tot),
      sedute: serie.length,
      seduteFantasma: Number(fantasma[0].giorni),
      tradeFantasma: Number(fantasma[0].n),
      giorniNegativi: pct(negativi, serie.length),
      winRate: pct(Number(esiti[0].vinti), Number(esiti[0].tot)),
      sortino: sortinoRatio(serie) ?? "—",
      sharpe: sharpeRatio(serie) ?? "—",
      maxDD: dd.maxDrawdownPct ?? "—",
      ulcer: ulcerIndex(perDrawdown, saldo) ?? "—",
    });
  }

  console.table(
    righe.map((r) => ({
      conto: r.conto,
      trade: r.trade,
      sedute: r.sedute,
      "sedute fantasma": r.seduteFantasma,
      "trade fantasma": r.tradeFantasma,
      "giorni negativi": r.giorniNegativi,
      "win rate": r.winRate,
      sortino: Number(r.sortino).toFixed(2),
      sharpe: Number(r.sharpe).toFixed(2),
      "max DD %": (Number(r.maxDD) * 100).toFixed(2),
      ulcer: Number(r.ulcer).toFixed(2),
    })),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
