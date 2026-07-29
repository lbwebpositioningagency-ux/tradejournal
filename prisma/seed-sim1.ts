import type { PrismaClient } from "../src/generated/prisma/client";
import { computeTrade } from "../src/lib/trade-compute";
import {
  buildSim1Dataset,
  buildSim1OpenTrades,
  SIM1_INITIAL_BALANCE,
} from "../src/lib/demo/sim1-dataset";

/**
 * SEED DEL CONTO DEMO GLOBALE "SIM1".
 *
 * DETERMINISTICO e IDEMPOTENTE: id stabili + RNG con seed fisso. Rilanciarlo
 * riporta SIM1 a uno stato noto — è la stessa proprietà che rende il conto
 * utilizzabile come golden fixture dei test.
 *
 * Il conto appartiene a un UTENTE DI SISTEMA che non può fare login
 * (passwordHash null, nessun provider OAuth collegato): esiste solo per
 * possedere i dati demo. Vedi src/lib/demo-account.ts per il modello.
 *
 * I campi denormalizzati passano dallo STESSO `computeTrade` dell'app: il
 * conto demo non è un'eccezione alla pipeline, ne è una verifica.
 */

const SIM1_ACCOUNT_ID = "sim1-account";
const SIM1_USER_ID = "sim1-system-user";

export async function seedSim1(
  prisma: PrismaClient,
  demoUserEmail: string,
  demoAccountName: string,
): Promise<{ closed: number; open: number; netPnl: string }> {
  // ── Utente di sistema: nessuna password, nessun login possibile ──────────
  const user = await prisma.user.upsert({
    where: { email: demoUserEmail },
    update: { name: "TradeJournal Demo", passwordHash: null },
    create: {
      id: SIM1_USER_ID,
      email: demoUserEmail,
      name: "TradeJournal Demo",
      passwordHash: null,
      timezone: "Europe/Rome",
      baseCurrency: "USD",
    },
  });

  // ── Conto demo condiviso ────────────────────────────────────────────────
  const account = await prisma.tradingAccount.upsert({
    where: { id: SIM1_ACCOUNT_ID },
    update: {
      name: demoAccountName,
      isDemo: true,
      currency: "USD",
      initialBalance: SIM1_INITIAL_BALANCE,
      isArchived: false,
    },
    create: {
      id: SIM1_ACCOUNT_ID,
      userId: user.id,
      name: demoAccountName,
      broker: "Simulatore",
      currency: "USD",
      initialBalance: SIM1_INITIAL_BALANCE,
      isDemo: true,
    },
  });

  const closed = buildSim1Dataset();
  const open = buildSim1OpenTrades();
  const all = [...closed, ...open];

  // ── Strategie e tag del dataset ─────────────────────────────────────────
  const strategyIds = new Map<string, string>();
  for (const name of new Set(all.map((t) => t.strategy))) {
    const strategy = await prisma.strategy.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: {},
      create: { userId: user.id, name },
    });
    strategyIds.set(name, strategy.id);
  }

  const tagIds = new Map<string, string>();
  for (const name of new Set(all.flatMap((t) => t.tags))) {
    const category = categoryFor(name);
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: { category },
      create: { userId: user.id, name, category },
    });
    tagIds.set(name, tag.id);
  }

  // Ricostruzione completa: cancella e ricrea (executions/tag/note in
  // cascata). È ciò che rende il seed idempotente in senso stretto — dopo,
  // SIM1 è esattamente lo stato atteso, anche se qualcosa l'aveva sporcato.
  await prisma.trade.deleteMany({ where: { tradingAccountId: account.id } });

  let netPnl = 0;
  for (const trade of all) {
    const computed = computeTrade(trade.executions, {
      pointValue: trade.pointValue,
      initialRisk: trade.initialRisk,
      plannedStop: trade.plannedStop,
      plannedTarget: trade.plannedTarget,
    });
    netPnl += Number(computed.netPnl);

    await prisma.trade.create({
      data: {
        id: trade.id,
        tradingAccountId: account.id,
        symbol: trade.symbol,
        assetClass: "FUTURES",
        direction: computed.direction,
        status: computed.status,
        openedAt: computed.openedAt,
        closedAt: computed.closedAt,
        pointValue: trade.pointValue,
        quantity: computed.quantity,
        avgEntryPrice: computed.avgEntryPrice,
        avgExitPrice: computed.avgExitPrice,
        grossPnl: computed.grossPnl,
        fees: computed.fees,
        netPnl: computed.netPnl,
        initialRisk: trade.initialRisk,
        plannedStop: trade.plannedStop,
        plannedTarget: trade.plannedTarget,
        rMultiple: computed.rMultiple,
        targetR: computed.targetR,
        strategyId: strategyIds.get(trade.strategy) ?? null,
        rating: trade.rating,
        executions: { create: trade.executions },
        tags: {
          create: trade.tags
            .map((name) => tagIds.get(name))
            .filter((id): id is string => Boolean(id))
            .map((tagId) => ({ tagId })),
        },
        ...(trade.note
          ? {
              notes: {
                create: {
                  userId: user.id,
                  type: "TRADE" as const,
                  content: trade.note,
                },
              },
            }
          : {}),
      },
    });
  }

  return {
    closed: closed.length,
    open: open.length,
    netPnl: netPnl.toFixed(2),
  };
}

function categoryFor(tag: string): "SETUP" | "MISTAKE" | "EMOTION" | "CUSTOM" {
  if (["breakout", "pullback", "reversal", "range"].includes(tag))
    return "SETUP";
  if (["fomo", "revenge", "oversize", "early-exit"].includes(tag))
    return "MISTAKE";
  if (["disciplina", "ansia", "tilt"].includes(tag)) return "EMOTION";
  return "CUSTOM";
}
