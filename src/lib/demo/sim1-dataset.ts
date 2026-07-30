import Decimal from "decimal.js";
import type { ExecutionInput } from "@/lib/trade-compute";

/**
 * DATASET DEL CONTO DEMO "SIM1" — generatore PURO e DETERMINISTICO.
 *
 * Non tocca il database: produce le specifiche dei trade. Lo usano
 * ① `prisma/seed-sim1.ts` per scrivere il conto demo globale e
 * ② i golden test delle metriche, che così girano senza Postgres.
 *
 * Determinismo: RNG mulberry32 con seed fisso e id stabili (`sim1-t0001`…).
 * Rigenerando il dataset si ottengono ESATTAMENTE gli stessi trade — è la
 * condizione perché i test possano asserire valori attesi noti.
 *
 * Realismo mirato: il dataset è costruito per ESERCITARE ogni metrica —
 * quattro strumenti con valore punto corretto, long e short, target R
 * variabili con hit-rate decrescente all'aumentare del target, un periodo di
 * drawdown seguito da recupero, streak lunghe garantite, hold time da minuti
 * a giorni, sessioni Asia/Londra/New York, fee su ogni lato.
 *
 * Nota sui tipi: i PREZZI sintetici si generano in float (come nel seed
 * storico del progetto), ma ogni valore monetario che finisce nelle
 * asserzioni o nel database passa da Decimal e da stringhe decimali.
 */

// ── RNG deterministico (mulberry32, lo schema usato in tutto il progetto) ──
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

/**
 * Seed dell'RNG. Scelto scansionando i candidati e tenendo quello che produce
 * un conto DEMO dalle caratteristiche plausibili (win rate 45-55%, profit
 * factor sotto 2,5, drawdown reale a doppia cifra, streak lunghe ma non
 * inverosimili). I dati non sono ritoccati a posteriori: cambia solo quale
 * flusso pseudocasuale viene estratto.
 *
 * Ri-scansionato nella Fase 23 dopo l'aumento di densità (il vecchio
 * 20260850 produceva un drawdown massimo del 7%, sotto la soglia dichiarata):
 * 20260862 → 623 trade, win rate 49,3%, PF 1,53, max DD 14,7%.
 */
export const SIM1_SEED = 20260862;

/** Saldo iniziale del conto demo (USD). */
export const SIM1_INITIAL_BALANCE = "50000.00";

interface SymbolSpec {
  symbol: string;
  pointValue: number;
  tick: number;
  decimals: number;
  basePrice: number;
  /** Ampiezza tipica del movimento giornaliero, in prezzo. */
  dailyVol: number;
  /** Quantità possibili (contratti). */
  qtyChoices: number[];
  /** Commissione per contratto e per lato. */
  feePerContractSide: number;
}

/** Quattro futures con il valore punto REALE del contratto. */
const SYMBOLS: SymbolSpec[] = [
  {
    symbol: "ES",
    pointValue: 50,
    tick: 0.25,
    decimals: 2,
    basePrice: 5900,
    dailyVol: 45,
    qtyChoices: [1, 1, 2, 2, 3],
    feePerContractSide: 2.1,
  },
  {
    symbol: "NQ",
    pointValue: 20,
    tick: 0.25,
    decimals: 2,
    basePrice: 21000,
    dailyVol: 190,
    qtyChoices: [1, 1, 2],
    feePerContractSide: 2.1,
  },
  {
    symbol: "GC",
    pointValue: 100,
    tick: 0.1,
    decimals: 1,
    basePrice: 2700,
    dailyVol: 26,
    qtyChoices: [1, 1, 2],
    feePerContractSide: 2.5,
  },
  {
    symbol: "CL",
    pointValue: 1000,
    tick: 0.01,
    decimals: 2,
    basePrice: 78,
    dailyVol: 1.4,
    qtyChoices: [1, 1, 2],
    feePerContractSide: 2.5,
  },
];

/**
 * Piani di trade: più alto è il target R, più basso è l'hit rate.
 * È la relazione che la "Return distribution per target R" deve poter
 * mostrare — qui è messa nei dati di proposito, non lasciata al caso.
 */
const TARGET_PLANS: { targetR: number; hitRate: number }[] = [
  { targetR: 1, hitRate: 0.55 },
  { targetR: 1.5, hitRate: 0.46 },
  { targetR: 2, hitRate: 0.38 },
  { targetR: 3, hitRate: 0.26 },
  { targetR: 4, hitRate: 0.19 },
];

/**
 * Regimi di mercato: moltiplicatore dell'hit rate per periodo. Creano un
 * DRAWDOWN vero (estate 2025) seguito da un recupero — indispensabile per
 * time underwater, Calmar, rolling metrics e Monte Carlo.
 */
const REGIMES: { until: string; hitFactor: number; label: string }[] = [
  { until: "2025-04-30", hitFactor: 1.0, label: "avvio solido" },
  { until: "2025-08-31", hitFactor: 0.6, label: "drawdown" },
  { until: "2026-02-28", hitFactor: 1.1, label: "recupero" },
  { until: "2099-12-31", hitFactor: 0.95, label: "regime normale" },
];

const STRATEGIES = [
  "Breakout ORB",
  "Pullback EMA",
  "News fade",
  "Mean reversion",
] as const;

const SETUP_TAGS = ["breakout", "pullback", "reversal", "range"] as const;
const MISTAKE_TAGS = ["fomo", "revenge", "oversize", "early-exit"] as const;
const EMOTION_TAGS = ["disciplina", "ansia", "tilt"] as const;

const NOTES = [
  "Setup da manuale: ingresso sul ritest, uscita al target senza esitare.",
  "Entrato in anticipo rispetto al piano, stop troppo stretto per la volatilità.",
  "Chiuso a metà corsa per stanchezza: il target è stato poi raggiunto.",
  "News a metà trade, gestione difensiva e uscita anticipata.",
  "Buona lettura del contesto, esecuzione da rivedere sull'uscita.",
  "Ho mediato una posizione perdente: errore già visto, da non ripetere.",
];

/** Un trade del dataset demo, pronto per la pipeline dell'app. */
export interface Sim1Trade {
  /** Id stabile: rigenerare il dataset non cambia gli id. */
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  /** Valore punto come stringa decimale (ES=50, NQ=20, GC=100, CL=1000). */
  pointValue: string;
  executions: ExecutionInput[];
  /** Rischio in valuta: |entry − stop| × qty × valore punto (scala 2). */
  initialRisk: string;
  plannedStop: string;
  plannedTarget: string;
  /** Target R del piano: |target − entry| / |entry − stop| (scala 4). */
  targetR: string;
  strategy: string;
  tags: string[];
  rating: number | null;
  note: string | null;
  /**
   * GOLDEN: netto atteso, calcolato per una via INDIPENDENTE dal motore
   * `computeTrade` (somma diretta delle tranche di uscita meno le fee).
   * Se il matching a costo medio della pipeline sbaglia, il test lo vede.
   */
  expectedNetPnl: string;
  /** GOLDEN: lordo atteso (senza fee). */
  expectedGrossPnl: string;
  /** GOLDEN: totale fee del trade. */
  expectedFees: string;
}

function roundToTick(price: number, spec: SymbolSpec): string {
  return (Math.round(price / spec.tick) * spec.tick).toFixed(spec.decimals);
}

/** Giorni feriali (lun-ven) tra due date UTC incluse. */
function weekdaysBetween(startIso: string, endIso: string): Date[] {
  const days: Date[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function regimeFor(day: Date): (typeof REGIMES)[number] {
  const iso = day.toISOString().slice(0, 10);
  return REGIMES.find((r) => iso <= r.until) ?? REGIMES[REGIMES.length - 1];
}

/**
 * Minuto di apertura (UTC): distribuzione voluta con mattina/pomeriggio
 * europei dominanti, una quota notturna e qualche apertura tarda. (Le
 * etichette nei commenti sono descrittive: la classificazione REALE in
 * sessioni la fa l'app, in ora italiana — Fase 35.)
 */
function openingMinuteUtc(r: number, rand: () => number): number {
  if (r < 0.18) return 1 * 60 + Math.floor(rand() * 240); // Asia (01:00-05:00Z)
  if (r < 0.55) return 8 * 60 + Math.floor(rand() * 210); // Londra (08:00-11:30Z)
  if (r < 0.95) return 14 * 60 + Math.floor(rand() * 300); // New York (14:00-19:00Z)
  return 22 * 60 + Math.floor(rand() * 90); // fuori sessione
}

/** Durata del trade in minuti: da scalping a swing multi-giorno. */
function holdMinutes(r: number, rand: () => number): number {
  if (r < 0.22) return 5 + Math.floor(rand() * 25); // 5-30m
  if (r < 0.6) return 30 + Math.floor(rand() * 120); // 30m-2h30
  if (r < 0.85) return 180 + Math.floor(rand() * 240); // 3h-7h
  return 1440 + Math.floor(rand() * 2880); // 1-3 giorni (swing)
}

/**
 * Streak deliberate: indici (0-based) in cui l'esito è FORZATO, così le
 * metriche di streak hanno sempre serie lunghe da mostrare, invece di
 * dipendere dalla fortuna dell'RNG.
 */
const FORCED_WIN_RUN = { start: 150, length: 6 };
const FORCED_LOSS_RUN = { start: 58, length: 7 };

function forcedOutcome(index: number): "win" | "loss" | null {
  if (
    index >= FORCED_WIN_RUN.start &&
    index < FORCED_WIN_RUN.start + FORCED_WIN_RUN.length
  ) {
    return "win";
  }
  if (
    index >= FORCED_LOSS_RUN.start &&
    index < FORCED_LOSS_RUN.start + FORCED_LOSS_RUN.length
  ) {
    return "loss";
  }
  return null;
}

/**
 * Netto atteso calcolato in modo indipendente dal motore della pipeline:
 * somma diretta di ogni tranche di uscita contro il prezzo d'ingresso.
 */
function expectations(
  executions: ExecutionInput[],
  pointValue: string,
  direction: "LONG" | "SHORT",
): { gross: string; fees: string; net: string } {
  const entry = executions[0];
  const entryPrice = new Decimal(entry.price);
  const sign = direction === "LONG" ? 1 : -1;
  const pv = new Decimal(pointValue);

  let gross = new Decimal(0);
  for (const exec of executions.slice(1)) {
    gross = gross.plus(
      new Decimal(exec.price)
        .minus(entryPrice)
        .times(sign)
        .times(exec.quantity)
        .times(pv),
    );
  }
  const fees = executions.reduce(
    (sum, exec) => sum.plus(new Decimal(exec.fee ?? "0")),
    new Decimal(0),
  );
  return {
    gross: gross.toFixed(2),
    fees: fees.toFixed(2),
    net: gross.minus(fees).toFixed(2),
  };
}

/**
 * Genera il dataset completo del conto demo: ~600 trade chiusi su oltre 18
 * mesi più 2 posizioni ancora aperte (per il widget "Posizioni aperte").
 *
 * Densità ALZATA nella Fase 23 (da ~0,5 a ~1,5 trade/giorno, profilo da day
 * trader attivo): i preset rolling a numero-trade arrivano a 500 e con i 200
 * trade storici nemmeno il demo avrebbe avuto una finestra piena da
 * mostrare. Il PERIODO resta lo stesso: i regimi datati (drawdown estate
 * 2025, recupero) alimentano underwater, Calmar e Monte Carlo e non vanno
 * spostati.
 */
export function buildSim1Dataset(seed: number = SIM1_SEED): Sim1Trade[] {
  const rand = mulberry32(seed);
  const days = weekdaysBetween("2025-01-06", "2026-07-24");
  const trades: Sim1Trade[] = [];

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    // ~1,5 trade per giornata operativa; il tetto è un fusibile che non deve
    // scattare prima della fine del periodo, altrimenti le finestre rolling
    // e il Monte Carlo temporale perdono respiro.
    if (rand() > 0.85) continue;
    const tradesToday = rand() < 0.75 ? 2 : 1;

    for (let k = 0; k < tradesToday; k++) {
      const index = trades.length;
      if (index >= 640) break;

      const spec = SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
      const direction: "LONG" | "SHORT" = rand() < 0.52 ? "LONG" : "SHORT";
      const sign = direction === "LONG" ? 1 : -1;
      const qty = spec.qtyChoices[Math.floor(rand() * spec.qtyChoices.length)];

      // Prezzo: deriva lenta sui 18 mesi + oscillazione + rumore.
      const drift =
        spec.basePrice * 0.00035 * dayIdx +
        Math.sin(dayIdx / 21) * spec.dailyVol * 2.2;
      const entryPrice = spec.basePrice + drift + (rand() - 0.5) * spec.dailyVol;

      // Piano: rischio ~1% del saldo, stop e target arrotondati al tick.
      const riskMoney = 300 + rand() * 400;
      const riskPerUnit = riskMoney / (qty * spec.pointValue);
      const plan = TARGET_PLANS[Math.floor(rand() * TARGET_PLANS.length)];

      const entryStr = roundToTick(entryPrice, spec);
      const entryDec = new Decimal(entryStr);
      const stopStr = roundToTick(entryPrice - sign * riskPerUnit, spec);
      const targetStr = roundToTick(
        entryPrice + sign * riskPerUnit * plan.targetR,
        spec,
      );

      // Rischio e target R DERIVATI dai prezzi arrotondati davvero salvati:
      // così l'app e il dataset parlano degli stessi numeri.
      const riskPoints = entryDec.minus(stopStr).abs();
      if (riskPoints.lte(0)) continue; // piano degenere: mai salvato
      const initialRisk = riskPoints
        .times(qty)
        .times(spec.pointValue)
        .toFixed(2);
      const targetR = new Decimal(targetStr)
        .minus(entryDec)
        .abs()
        .div(riskPoints)
        .toFixed(4);

      // Esito: hit del target, gestione manuale, oppure stop.
      const regime = regimeFor(day);
      const hitRate = Math.min(0.9, plan.hitRate * regime.hitFactor);
      const forced = forcedOutcome(index);
      const roll = rand();
      let realizedR: number;
      if (forced === "win" || (forced === null && roll < hitRate)) {
        // Target COLPITO: l'uscita avviene AL prezzo target, non appena
        // prima — un ordine limite si riempie al suo prezzo. Ogni tanto un
        // filo oltre (uscita a mercato su un allungo).
        realizedR = plan.targetR * (rand() < 0.8 ? 1 : 1 + rand() * 0.06);
      } else if (forced === "loss") {
        realizedR = -(0.9 + rand() * 0.25);
      } else if (roll < hitRate + (1 - hitRate) * 0.35) {
        // Gestione manuale: uscita in mezzo, può essere in piccolo utile o perdita.
        realizedR = -0.5 + rand() * 1.1;
      } else {
        realizedR = -(0.9 + rand() * 0.25); // stop colpito (con slippage)
      }

      const exitStr = roundToTick(
        entryDec.toNumber() + sign * realizedR * riskPoints.toNumber(),
        spec,
      );

      // Orari: sessione, durata, apertura.
      const openMinute = openingMinuteUtc(rand(), rand);
      const duration = holdMinutes(rand(), rand);
      const openedAt = new Date(day.getTime() + openMinute * 60_000);
      const closedAt = new Date(openedAt.getTime() + duration * 60_000);

      const entrySide = direction === "LONG" ? ("BUY" as const) : ("SELL" as const);
      const exitSide = direction === "LONG" ? ("SELL" as const) : ("BUY" as const);
      const fee = (contracts: number) =>
        (contracts * spec.feePerContractSide).toFixed(2);

      const executions: ExecutionInput[] = [
        {
          side: entrySide,
          quantity: String(qty),
          price: entryStr,
          fee: fee(qty),
          executedAt: openedAt,
        },
      ];

      // ~25% dei trade con più contratti esce in due tranche (scale-out).
      if (qty > 1 && rand() < 0.35) {
        const firstQty = Math.max(1, Math.floor(qty * 0.6));
        const restQty = qty - firstQty;
        const midAt = new Date(
          openedAt.getTime() + Math.floor(duration * 0.55) * 60_000,
        );
        const midR = realizedR * (0.45 + rand() * 0.35);
        executions.push(
          {
            side: exitSide,
            quantity: String(firstQty),
            price: roundToTick(
              entryDec.toNumber() + sign * midR * riskPoints.toNumber(),
              spec,
            ),
            fee: fee(firstQty),
            executedAt: midAt,
          },
          {
            side: exitSide,
            quantity: String(restQty),
            price: exitStr,
            fee: fee(restQty),
            executedAt: closedAt,
          },
        );
      } else {
        executions.push({
          side: exitSide,
          quantity: String(qty),
          price: exitStr,
          fee: fee(qty),
          executedAt: closedAt,
        });
      }

      const expected = expectations(executions, String(spec.pointValue), direction);
      const isLoss = new Decimal(expected.net).lt(0);

      const tags: string[] = [];
      if (rand() < 0.85) {
        tags.push(SETUP_TAGS[Math.floor(rand() * SETUP_TAGS.length)]);
      }
      if (isLoss && rand() < 0.45) {
        tags.push(MISTAKE_TAGS[Math.floor(rand() * MISTAKE_TAGS.length)]);
      }
      if (rand() < 0.35) {
        tags.push(EMOTION_TAGS[Math.floor(rand() * EMOTION_TAGS.length)]);
      }

      trades.push({
        id: `sim1-t${String(index + 1).padStart(4, "0")}`,
        symbol: spec.symbol,
        direction,
        pointValue: String(spec.pointValue),
        executions,
        initialRisk,
        plannedStop: stopStr,
        plannedTarget: targetStr,
        targetR,
        strategy: STRATEGIES[Math.floor(rand() * STRATEGIES.length)],
        tags: [...new Set(tags)],
        rating: rand() < 0.7 ? 1 + Math.floor(rand() * 5) : null,
        note: rand() < 0.28 ? NOTES[Math.floor(rand() * NOTES.length)] : null,
        expectedNetPnl: expected.net,
        expectedGrossPnl: expected.gross,
        expectedFees: expected.fees,
      });
    }
  }

  return trades;
}

/**
 * Due posizioni APERTE deterministiche (fuori dall'RNG), datate a ridosso
 * della fine del dataset: esercitano il widget "Posizioni aperte" e il
 * percorso dei trade senza chiusura.
 */
export function buildSim1OpenTrades(): Sim1Trade[] {
  const open: {
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    pointValue: string;
    qty: string;
    price: string;
    fee: string;
    at: string;
    stop: string;
    target: string;
    initialRisk: string;
    targetR: string;
    strategy: string;
  }[] = [
    {
      id: "sim1-open-01",
      symbol: "ES",
      direction: "LONG",
      pointValue: "50",
      qty: "2",
      price: "6280.00",
      fee: "4.20",
      at: "2026-07-27T14:35:00Z",
      stop: "6275.00",
      target: "6295.00",
      initialRisk: "500.00", // |6280-6275| × 2 × 50
      targetR: "3.0000", // 15 / 5
      strategy: "Breakout ORB",
    },
    {
      id: "sim1-open-02",
      symbol: "CL",
      direction: "SHORT",
      pointValue: "1000",
      qty: "1",
      price: "82.40",
      fee: "2.50",
      at: "2026-07-28T09:10:00Z",
      stop: "82.80",
      target: "81.60",
      initialRisk: "400.00", // |82.40-82.80| × 1 × 1000
      targetR: "2.0000", // 0.80 / 0.40
      strategy: "Mean reversion",
    },
  ];

  return open.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    direction: o.direction,
    pointValue: o.pointValue,
    executions: [
      {
        side: o.direction === "LONG" ? ("BUY" as const) : ("SELL" as const),
        quantity: o.qty,
        price: o.price,
        fee: o.fee,
        executedAt: new Date(o.at),
      },
    ],
    initialRisk: o.initialRisk,
    plannedStop: o.stop,
    plannedTarget: o.target,
    targetR: o.targetR,
    strategy: o.strategy,
    tags: ["breakout"],
    rating: null,
    note: null,
    // Nessuna uscita: il netto è la sola commissione di ingresso, col segno.
    expectedGrossPnl: "0.00",
    expectedFees: o.fee,
    expectedNetPnl: new Decimal(0).minus(o.fee).toFixed(2),
  }));
}
