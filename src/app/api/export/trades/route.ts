import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeAccountWhere } from "@/lib/active-account";
import { resolveTradeScope } from "@/lib/demo-account";
import { toCsv } from "@/lib/csv";
import { resolvePeriod } from "@/lib/period";
import { periodCookieFallback } from "@/lib/period-cookie";
import {
  buildTradeFilterWhere,
  buildTradeOrderBy,
  parseTradeFilters,
  parseTradeSort,
} from "@/lib/trade-filters";

/**
 * GET /api/export/trades (F37) — CSV dei trade coi FILTRI CORRENTI della
 * Trade View (stessi searchParams, stesso where, stesso ordinamento).
 * Date ISO 8601 UTC, Decimal come stringhe col punto: un backup
 * riimportabile, non un formato regionale. Query a lotti, mai tutto in RAM
 * in un colpo solo.
 */

const BATCH = 1000;

const HEADER = [
  "openedAt",
  "closedAt",
  "symbol",
  "assetClass",
  "direction",
  "status",
  "quantity",
  "avgEntryPrice",
  "avgExitPrice",
  "pointValue",
  "grossPnl",
  "fees",
  "swap",
  "netPnl",
  "initialRisk",
  "plannedStop",
  "plannedTarget",
  "rMultiple",
  "targetR",
  "rating",
  "strategy",
  "tags",
  "account",
  "currency",
];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const sessionUserId = session.user.id;

  const params: Record<string, string | undefined> = {};
  for (const [key, value] of request.nextUrl.searchParams) params[key] = value;

  const [user, tradeScope] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUserId },
      select: { timezone: true },
    }),
    resolveTradeScope(sessionUserId),
  ]);
  // Stesso scope della Trade View: esportare il conto demo è LETTURA, quindi
  // legittimo (l'export non modifica nulla).
  const userId = tradeScope.userId;
  const activeAccountId = tradeScope.accountId;

  const filters = parseTradeFilters(params);
  // B3-4 — periodo ricordato dal cookie quando l'URL non ne porta uno esplicito.
  const period = resolvePeriod(params, user.timezone, undefined, await periodCookieFallback());
  const sort = parseTradeSort(params);
  const where = {
    ...tradeAccountWhere(userId, activeAccountId),
    ...buildTradeFilterWhere(filters, period),
  };

  const rows: string[][] = [HEADER];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.trade.findMany({
      where,
      orderBy: buildTradeOrderBy(sort),
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        account: { select: { name: true, currency: true } },
        strategy: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    });
    for (const t of batch) {
      rows.push([
        t.openedAt.toISOString(),
        t.closedAt ? t.closedAt.toISOString() : "",
        t.symbol,
        t.assetClass,
        t.direction,
        t.status,
        t.quantity.toString(),
        t.avgEntryPrice.toString(),
        t.avgExitPrice?.toString() ?? "",
        t.pointValue.toString(),
        t.grossPnl.toString(),
        t.fees.toString(),
        t.swap.toString(),
        t.netPnl.toString(),
        t.initialRisk?.toString() ?? "",
        t.plannedStop?.toString() ?? "",
        t.plannedTarget?.toString() ?? "",
        t.rMultiple?.toString() ?? "",
        t.targetR?.toString() ?? "",
        t.rating !== null ? String(t.rating) : "",
        t.strategy?.name ?? "",
        t.tags.map(({ tag }) => tag.name).join("|"),
        t.account.name,
        t.account.currency,
      ]);
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tradingspace-export-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
