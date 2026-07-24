import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  computeTrade,
  type ExecutionInput,
} from "../src/lib/trade-compute";

/**
 * Seed: utente demo + 2 conti + strategie + tag + ~200 trade realistici
 * distribuiti sugli ultimi 3 mesi, più scenari deterministici (trade aperti,
 * trade overnight a cavallo di mezzanotte nel fuso utente).
 *
 * Deterministico (RNG con seed fisso): rilanciare `db:seed` rigenera gli
 * stessi dati. I trade esistenti dell'utente demo vengono cancellati e
 * ricreati. I campi denormalizzati sono calcolati con lo STESSO modulo
 * Decimal-safe usato dall'app (src/lib/trade-compute.ts); i number JS sono
 * usati solo per generare prezzi sintetici, mai per i calcoli monetari.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_EMAIL = "demo@tradejournal.local";
const DEMO_PASSWORD = "demo1234";

// ── RNG deterministico (mulberry32) ─────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260715);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function randBetween(min: number, max: number): number {
  return min + rand() * (max - min);
}
function chance(p: number): boolean {
  return rand() < p;
}

// ── Specifiche simboli ──────────────────────────────────────────────────
type SymbolSpec = {
  symbol: string;
  assetClass: "FUTURES" | "FOREX";
  pointValue: string;
  tick: number;
  decimals: number;
  basePrice: number;
  dailyVol: number; // ampiezza tipica del movimento intraday (in prezzo)
  qty: () => number;
  qtyDecimals: number;
  feePerUnitSide: number; // fee per unità di qty, per lato
};

const FUTURES_SYMBOLS: SymbolSpec[] = [
  {
    symbol: "ES",
    assetClass: "FUTURES",
    pointValue: "50",
    tick: 0.25,
    decimals: 2,
    basePrice: 5600,
    dailyVol: 40,
    qty: () => Math.floor(randBetween(1, 4)),
    qtyDecimals: 0,
    feePerUnitSide: 2.1,
  },
  {
    symbol: "NQ",
    assetClass: "FUTURES",
    pointValue: "20",
    tick: 0.25,
    decimals: 2,
    basePrice: 20200,
    dailyVol: 180,
    qty: () => Math.floor(randBetween(1, 3)),
    qtyDecimals: 0,
    feePerUnitSide: 2.1,
  },
  {
    symbol: "GC",
    assetClass: "FUTURES",
    pointValue: "100",
    tick: 0.1,
    decimals: 1,
    basePrice: 2650,
    dailyVol: 25,
    qty: () => 1,
    qtyDecimals: 0,
    feePerUnitSide: 2.5,
  },
];

const FOREX_SYMBOLS: SymbolSpec[] = [
  {
    symbol: "EURUSD",
    assetClass: "FOREX",
    pointValue: "100000",
    tick: 0.00001,
    decimals: 5,
    basePrice: 1.085,
    dailyVol: 0.006,
    qty: () => Math.round(randBetween(0.1, 1.0) * 100) / 100,
    qtyDecimals: 2,
    feePerUnitSide: 3.5,
  },
  {
    symbol: "GBPUSD",
    assetClass: "FOREX",
    pointValue: "100000",
    tick: 0.00001,
    decimals: 5,
    basePrice: 1.27,
    dailyVol: 0.008,
    qty: () => Math.round(randBetween(0.1, 0.8) * 100) / 100,
    qtyDecimals: 2,
    feePerUnitSide: 3.5,
  },
  {
    symbol: "XAUUSD",
    assetClass: "FOREX",
    pointValue: "100",
    tick: 0.01,
    decimals: 2,
    basePrice: 2640,
    dailyVol: 28,
    qty: () => Math.round(randBetween(0.5, 2) * 100) / 100,
    qtyDecimals: 2,
    feePerUnitSide: 4.0,
  },
];

function roundToTick(price: number, spec: SymbolSpec): string {
  const rounded = Math.round(price / spec.tick) * spec.tick;
  return rounded.toFixed(spec.decimals);
}

const NOTES = [
  "Ingresso da piano: breakout confermato dal volume.",
  "Entrato in anticipo, lo stop era troppo stretto per la volatilità.",
  "Trade da manuale, uscito al target senza esitazioni.",
  "Ho mediato una posizione in perdita: da non rifare.",
  "News inattese a metà trade, chiuso in fretta.",
  "Buona lettura del contesto, esecuzione migliorabile.",
  "Chiuso troppo presto: il target sarebbe stato raggiunto.",
];

const SETUP_TAGS = ["breakout", "pullback", "reversal", "range"];
const MISTAKE_TAGS = ["fomo", "revenge", "oversize", "early-exit"];
const EMOTION_TAGS = ["disciplina", "ansia", "tilt"];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Utente demo + conti
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      name: "Demo Trader",
      email: DEMO_EMAIL,
      passwordHash,
      timezone: "Europe/Rome",
      baseCurrency: "USD",
    },
  });

  const futuresAccount = await prisma.tradingAccount.upsert({
    where: { userId_name: { userId: user.id, name: "Conto futures" } },
    update: {},
    create: {
      userId: user.id,
      name: "Conto futures",
      broker: "NinjaTrader",
      currency: "USD",
      initialBalance: "25000.00",
    },
  });
  const forexAccount = await prisma.tradingAccount.upsert({
    where: { userId_name: { userId: user.id, name: "Conto forex" } },
    update: {},
    create: {
      userId: user.id,
      name: "Conto forex",
      broker: "IC Markets",
      currency: "EUR",
      initialBalance: "10000.00",
    },
  });

  // Strategie
  const strategyDefs = [
    { name: "Breakout ORB", color: "#2563eb", description: "Breakout del range di apertura (15m) con conferma di volume." },
    { name: "Pullback EMA", color: "#10b981", description: "Rientro sulla EMA 20 in trend, ingresso su candela di rifiuto." },
    { name: "News fade", color: "#f59e0b", description: "Fade del movimento iniziale su news ad alto impatto." },
  ];
  const strategies = [];
  for (const def of strategyDefs) {
    strategies.push(
      await prisma.strategy.upsert({
        where: { userId_name: { userId: user.id, name: def.name } },
        update: { color: def.color, description: def.description },
        create: { userId: user.id, ...def },
      }),
    );
  }

  // Tag
  const tagIds = new Map<string, string>();
  const tagDefs = [
    ...SETUP_TAGS.map((name) => ({ name, category: "SETUP" as const })),
    ...MISTAKE_TAGS.map((name) => ({ name, category: "MISTAKE" as const })),
    ...EMOTION_TAGS.map((name) => ({ name, category: "EMOTION" as const })),
  ];
  for (const def of tagDefs) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId: user.id, name: def.name } },
      update: { category: def.category },
      create: { userId: user.id, ...def },
    });
    tagIds.set(def.name, tag.id);
  }

  // Pulizia trade esistenti (esecuzioni/tag/note in cascata)
  await prisma.trade.deleteMany({ where: { account: { userId: user.id } } });

  // ── Generazione trade: ~3 mesi fino al 14/07/2026 ─────────────────────
  const start = new Date(Date.UTC(2026, 3, 15)); // 15 aprile 2026
  const end = new Date(Date.UTC(2026, 6, 14)); // 14 luglio 2026
  let created = 0;
  let dayIndex = 0;

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // niente weekend
    dayIndex += 1;
    if (chance(0.12)) continue; // giornata senza trade

    const tradesToday = Math.floor(randBetween(2, 6.2)); // 2-6
    let minuteCursor = 7 * 60 + Math.floor(randBetween(0, 60)); // dalle ~07:00 UTC

    for (let t = 0; t < tradesToday; t++) {
      const useFutures = chance(0.6);
      const account = useFutures ? futuresAccount : forexAccount;
      const spec = pick(useFutures ? FUTURES_SYMBOLS : FOREX_SYMBOLS);
      const direction = chance(0.5) ? "LONG" : "SHORT";
      const qty = spec.qty();
      const qtyStr = qty.toFixed(spec.qtyDecimals);

      // Prezzo di ingresso: base + drift stagionale + rumore giornaliero
      const drift = Math.sin(dayIndex / 9) * spec.dailyVol * 3 + dayIndex * spec.dailyVol * 0.02;
      const noise = randBetween(-spec.dailyVol, spec.dailyVol);
      const entryPrice = spec.basePrice + drift + noise;

      // Esito: ~55% win; R vincenti 0.4-2.8, perdenti -0.25/-1.15
      const isWin = chance(0.55);
      const rMultiple = isWin ? randBetween(0.4, 2.8) : -randBetween(0.25, 1.15);
      const riskMoney = useFutures ? randBetween(150, 600) : randBetween(60, 300);
      const pointValueNum = Number(spec.pointValue);
      const priceMove = (rMultiple * riskMoney) / (qty * pointValueNum);
      const signedMove = direction === "LONG" ? priceMove : -priceMove;
      const exitPrice = entryPrice + signedMove;

      // Orari
      const entryMinute = minuteCursor + Math.floor(randBetween(0, 45));
      const durationMin = Math.floor(randBetween(5, 180));
      minuteCursor = entryMinute + durationMin + Math.floor(randBetween(10, 60));
      const entryAt = new Date(d.getTime() + entryMinute * 60_000);
      const exitAt = new Date(entryAt.getTime() + durationMin * 60_000);

      const entrySide = direction === "LONG" ? ("BUY" as const) : ("SELL" as const);
      const exitSide = direction === "LONG" ? ("SELL" as const) : ("BUY" as const);
      const feeSide = (q: number) => (q * spec.feePerUnitSide).toFixed(2);

      const executions: ExecutionInput[] = [
        {
          side: entrySide,
          quantity: qtyStr,
          price: roundToTick(entryPrice, spec),
          fee: feeSide(qty),
          executedAt: entryAt,
        },
      ];

      // 30% scale-out in due uscite parziali (i trade APERTI sono scenari
      // deterministici aggiunti dopo il loop, mai lasciati al caso dell'RNG)
      if (chance(0.3) && qty > (spec.qtyDecimals === 0 ? 1 : 0.15)) {
        const firstPortion = spec.qtyDecimals === 0
          ? Math.max(1, Math.floor(qty * 0.6))
          : Math.round(qty * 0.6 * 100) / 100;
        const rest = spec.qtyDecimals === 0
          ? qty - firstPortion
          : Math.round((qty - firstPortion) * 100) / 100;
        const midAt = new Date(entryAt.getTime() + Math.floor(durationMin * 0.55) * 60_000);
        const midMove = signedMove * randBetween(0.5, 0.85);
        executions.push(
          {
            side: exitSide,
            quantity: firstPortion.toFixed(spec.qtyDecimals),
            price: roundToTick(entryPrice + midMove, spec),
            fee: feeSide(firstPortion),
            executedAt: midAt,
          },
          {
            side: exitSide,
            quantity: rest.toFixed(spec.qtyDecimals),
            price: roundToTick(exitPrice, spec),
            fee: feeSide(rest),
            executedAt: exitAt,
          },
        );
      } else {
        executions.push({
          side: exitSide,
          quantity: qtyStr,
          price: roundToTick(exitPrice, spec),
          fee: feeSide(qty),
          executedAt: exitAt,
        });
      }

      const hasRisk = chance(0.85);
      const initialRisk = hasRisk ? riskMoney.toFixed(2) : null;

      // Piano stop/target (F16a): derivato dal rischio già estratto, SENZA
      // nuove chiamate a rand() — il resto del dataset resta identico.
      // RR pianificato 1.5-3 a rotazione; ~70% dei trade con rischio ha piano.
      const riskPerUnit = riskMoney / (qty * pointValueNum);
      const plannedRR = [1.5, 2, 2.5, 3][created % 4];
      const withPlan = hasRisk && created % 10 < 7;
      const stopOffset = direction === "LONG" ? -riskPerUnit : riskPerUnit;
      const plannedStop = withPlan
        ? roundToTick(entryPrice + stopOffset, spec)
        : null;
      const plannedTarget = withPlan
        ? roundToTick(entryPrice - stopOffset * plannedRR, spec)
        : null;

      const computed = computeTrade(executions, {
        pointValue: spec.pointValue,
        initialRisk,
      });

      // Tag: setup sempre-ish, errori sui loss, emozioni sparse
      const tradeTagIds = new Set<string>();
      if (chance(0.8)) tradeTagIds.add(tagIds.get(pick(SETUP_TAGS))!);
      if (!isWin && chance(0.5)) tradeTagIds.add(tagIds.get(pick(MISTAKE_TAGS))!);
      if (chance(0.3)) tradeTagIds.add(tagIds.get(pick(EMOTION_TAGS))!);

      const strategy = chance(0.7) ? pick(strategies) : null;
      const note = chance(0.3) ? pick(NOTES) : null;

      await prisma.trade.create({
        data: {
          tradingAccountId: account.id,
          symbol: spec.symbol,
          assetClass: spec.assetClass,
          direction: computed.direction,
          status: computed.status,
          openedAt: computed.openedAt,
          closedAt: computed.closedAt,
          pointValue: spec.pointValue,
          quantity: computed.quantity,
          avgEntryPrice: computed.avgEntryPrice,
          avgExitPrice: computed.avgExitPrice,
          grossPnl: computed.grossPnl,
          fees: computed.fees,
          netPnl: computed.netPnl,
          initialRisk,
          plannedStop,
          plannedTarget,
          rMultiple: computed.rMultiple,
          strategyId: strategy?.id ?? null,
          rating: chance(0.7) ? Math.ceil(randBetween(0.01, 5)) : null,
          executions: { create: executions },
          tags: { create: [...tradeTagIds].map((tagId) => ({ tagId })) },
          ...(note
            ? { notes: { create: { userId: user.id, type: "TRADE" as const, content: note } } }
            : {}),
        },
      });
      created += 1;
    }
  }

  // ── Scenari DETERMINISTICI (fuori dall'RNG): casi limite garantiti ──────
  // 1) Trade APERTO con fee di ingresso: netPnl = −fee, il filtro esito lo
  //    classifica "loss" pur senza uscite (limite dichiarato in FASE 7).
  // 2) Trade APERTO senza fee: netPnl = 0, classificato "be".
  // 3) Trade overnight a cavallo di mezzanotte nel fuso utente (aperto
  //    gio 09/07 23:30 Roma = 21:30Z, chiuso ven 10/07 00:30 Roma = 22:30Z):
  //    rende reale la divergenza Trade View (openedAt) / Reports (closedAt)
  //    su un confine di periodo come from=2026-07-10.
  const scenarioTrades = [
    {
      account: futuresAccount,
      symbol: "ES",
      assetClass: "FUTURES" as const,
      pointValue: "50",
      initialRisk: "500.00",
      // Piano su trade APERTO: "Piano vs esito" mostra il piano, esito in attesa.
      plannedStop: "5615.00",
      plannedTarget: "5635.00",
      executions: [
        {
          side: "BUY" as const,
          quantity: "2",
          price: "5620.00",
          fee: "8.40",
          executedAt: new Date("2026-07-13T14:30:00Z"),
        },
      ],
    },
    {
      account: forexAccount,
      symbol: "EURUSD",
      assetClass: "FOREX" as const,
      pointValue: "100000",
      initialRisk: null,
      plannedStop: null,
      plannedTarget: null,
      executions: [
        {
          side: "SELL" as const,
          quantity: "0.50",
          price: "1.08500",
          fee: "0",
          executedAt: new Date("2026-07-14T09:15:00Z"),
        },
      ],
    },
    {
      account: futuresAccount,
      symbol: "NQ",
      assetClass: "FUTURES" as const,
      pointValue: "20",
      initialRisk: "400.00",
      // Piano 2R: stop 20 pt sotto, target 40 pt sopra; uscita a +20 pt = 1R,
      // quindi "piano raggiunto 50%" deterministico per la verifica.
      plannedStop: "20230.00",
      plannedTarget: "20290.00",
      executions: [
        {
          side: "BUY" as const,
          quantity: "1",
          price: "20250.00",
          fee: "2.10",
          executedAt: new Date("2026-07-09T21:30:00Z"),
        },
        {
          side: "SELL" as const,
          quantity: "1",
          price: "20270.00",
          fee: "2.10",
          executedAt: new Date("2026-07-09T22:30:00Z"),
        },
      ],
    },
  ];

  for (const scenario of scenarioTrades) {
    const computed = computeTrade(scenario.executions, {
      pointValue: scenario.pointValue,
      initialRisk: scenario.initialRisk,
    });
    await prisma.trade.create({
      data: {
        tradingAccountId: scenario.account.id,
        symbol: scenario.symbol,
        assetClass: scenario.assetClass,
        direction: computed.direction,
        status: computed.status,
        openedAt: computed.openedAt,
        closedAt: computed.closedAt,
        pointValue: scenario.pointValue,
        quantity: computed.quantity,
        avgEntryPrice: computed.avgEntryPrice,
        avgExitPrice: computed.avgExitPrice,
        grossPnl: computed.grossPnl,
        fees: computed.fees,
        netPnl: computed.netPnl,
        initialRisk: scenario.initialRisk,
        plannedStop: scenario.plannedStop,
        plannedTarget: scenario.plannedTarget,
        rMultiple: computed.rMultiple,
        executions: { create: scenario.executions },
      },
    });
    created += 1;
  }

  console.log(
    `Seed completato: ${user.email} (password: ${DEMO_PASSWORD}) — ${created} trade generati (2 aperti + 1 overnight deterministici)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
