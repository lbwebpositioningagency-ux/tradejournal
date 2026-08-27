import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeTrade } from "@/lib/trade-compute";
import { giornoDiBucketing } from "@/lib/demo/sessioni";
import { isoWeekday } from "@/lib/seasonality/buckets";
import {
  avgLoss,
  avgWin,
  expectancy,
  maxDrawdown,
  payoffRatio,
  profitFactor,
  winRate,
} from "@/lib/metrics";
import {
  buildSim1Dataset,
  buildSim1OpenTrades,
  SIM1_INITIAL_BALANCE,
  type Sim1Trade,
} from "./sim1-dataset";

/**
 * GOLDEN TEST del conto demo SIM1.
 *
 * SIM1 è insieme la vetrina dell'app e la fixture di verifica delle metriche:
 * essendo deterministico, i suoi numeri sono NOTI e possono essere asseriti.
 * Se un giorno il motore di calcolo (o una formula) cambia comportamento
 * senza che nessuno se ne accorga, questi test cadono.
 *
 * Il controllo cardine è l'INTEGRITÀ DEL P&L: per ogni trade il netto
 * prodotto dalla pipeline (`computeTrade`, matching a costo medio) deve
 * coincidere al centesimo col netto atteso, calcolato nel dataset per una via
 * indipendente (somma diretta delle tranche di uscita meno le fee) — è
 * l'equivalente del confronto "P&L calcolato == P&L del broker", strumento
 * per strumento.
 */

const dataset = buildSim1Dataset();
const openTrades = buildSim1OpenTrades();

function compute(trade: Sim1Trade) {
  return computeTrade(trade.executions, {
    pointValue: trade.pointValue,
    initialRisk: trade.initialRisk,
    plannedStop: trade.plannedStop,
    plannedTarget: trade.plannedTarget,
  });
}

describe("SIM1 — determinismo", () => {
  it("rigenera esattamente lo stesso dataset a ogni chiamata", () => {
    const again = buildSim1Dataset();
    expect(again.length).toBe(dataset.length);
    expect(again.map((t) => t.id)).toEqual(dataset.map((t) => t.id));
    expect(again.map((t) => t.expectedNetPnl)).toEqual(
      dataset.map((t) => t.expectedNetPnl),
    );
  });

  it("usa id stabili e univoci", () => {
    const ids = [...dataset, ...openTrades].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(dataset[0].id).toBe("sim1-t0001");
  });

  it("un seed diverso produce un dataset diverso (l'RNG conta davvero)", () => {
    const other = buildSim1Dataset(12345);
    expect(other.map((t) => t.expectedNetPnl)).not.toEqual(
      dataset.map((t) => t.expectedNetPnl),
    );
  });
});

describe("SIM1 — integrità del P&L (golden)", () => {
  it("per OGNI trade il netto della pipeline coincide con l'atteso indipendente", () => {
    const divergent = dataset
      .map((trade) => ({ trade, computed: compute(trade) }))
      .filter(({ trade, computed }) => computed.netPnl !== trade.expectedNetPnl)
      .map(({ trade, computed }) => ({
        id: trade.id,
        atteso: trade.expectedNetPnl,
        calcolato: computed.netPnl,
      }));
    expect(divergent).toEqual([]);
  });

  it("anche lordo e fee coincidono (nessuna compensazione tra i due)", () => {
    for (const trade of dataset) {
      const computed = compute(trade);
      expect(computed.grossPnl).toBe(trade.expectedGrossPnl);
      expect(computed.fees).toBe(trade.expectedFees);
    }
  });

  it("il netto per STRUMENTO è quello atteso (valore punto corretto)", () => {
    const perSymbol = new Map<string, Decimal>();
    const perSymbolCount = new Map<string, number>();
    for (const trade of dataset) {
      const net = new Decimal(compute(trade).netPnl);
      perSymbol.set(
        trade.symbol,
        (perSymbol.get(trade.symbol) ?? new Decimal(0)).plus(net),
      );
      perSymbolCount.set(
        trade.symbol,
        (perSymbolCount.get(trade.symbol) ?? 0) + 1,
      );
    }
    const actual = Object.fromEntries(
      [...perSymbol].map(([symbol, net]) => [
        symbol,
        { trades: perSymbolCount.get(symbol), net: net.toFixed(2) },
      ]),
    );
    // ES è lo strumento marginale del conto (+5,4k su 154 trade, contro i
    // ~27-30k di GC e NQ): il breakdown "per simbolo" ha così qualcosa da
    // dire, non quattro righe tutte uguali.
    expect(actual).toEqual({
      ES: { trades: 154, net: "5398.90" },
      NQ: { trades: 150, net: "26885.00" },
      GC: { trades: 151, net: "30000.00" },
      CL: { trades: 168, net: "9435.00" },
    });
  });

  it("la somma per strumento è il netto totale (nessun trade perso)", () => {
    const total = dataset.reduce(
      (sum, trade) => sum.plus(compute(trade).netPnl),
      new Decimal(0),
    );
    expect(total.toFixed(2)).toBe("71718.90");
  });
});

describe("SIM1 — metriche golden", () => {
  const rows = dataset.map(compute);
  const wins = rows.filter((r) => new Decimal(r.netPnl).gt(0));
  const losses = rows.filter((r) => new Decimal(r.netPnl).lt(0));
  const sum = (list: typeof rows) =>
    list.reduce((acc, r) => acc.plus(r.netPnl), new Decimal(0));

  const aggregates = {
    total: rows.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: rows.length - wins.length - losses.length,
    netPnl: sum(rows).toFixed(2),
    winSum: sum(wins).toFixed(2),
    lossSum: sum(losses).toFixed(2),
    fees: rows.reduce((acc, r) => acc.plus(r.fees), new Decimal(0)).toFixed(2),
  };

  it("conteggi e somme", () => {
    expect(aggregates).toEqual({
      total: 623,
      wins: 307,
      losses: 316,
      breakevens: 0,
      netPnl: "71718.90",
      winSum: "206904.20",
      lossSum: "-135185.30",
      fees: "4233.60",
    });
  });

  it("win rate, profit factor, expectancy, payoff", () => {
    expect(winRate(aggregates.wins, aggregates.total)).toBe("0.4928");
    expect(profitFactor(aggregates.winSum, aggregates.lossSum)).toBe("1.5305");
    expect(expectancy(aggregates)).toBe("115.12");
    expect(avgWin(aggregates.winSum, aggregates.wins)).toBe("673.96");
    expect(avgLoss(aggregates.lossSum, aggregates.losses)).toBe("427.80");
    expect(
      payoffRatio(
        avgWin(aggregates.winSum, aggregates.wins),
        avgLoss(aggregates.lossSum, aggregates.losses),
      ),
    ).toBe("1.5754");
  });

  it("NESSUNA CHIUSURA NEL FINE SETTIMANA, nel fuso in cui l'app bucketa", () => {
    /* Il difetto tolto il 27/08/2026: 41 trade chiusi su 37 giornate di
       sabato o domenica, su CL/ES/GC/NQ — futures, chiusi nel weekend. Ogni
       giornata fantasma era un'osservazione in più nel denominatore di
       Sortino, Sharpe, Ulcer e drawdown. */
    const fuori = rows.filter((row) => {
      const [a, m, g] = giornoDiBucketing(row.closedAt!).split("-").map(Number);
      return isoWeekday(a, m, g) > 5;
    });
    expect(fuori).toEqual([]);
  });

  it("drawdown reale sulla curva di equity giornaliera", () => {
    /* BUCKETING NEL FUSO DELL'UTENTE, come fa l'app: fino al 27/08/2026
       questo golden raggruppava per giorno UTC, e su una curva di equity il
       fuso decide a quale giornata appartiene il P&L. Con la stessa
       convenzione dell'app il dataset ha 344 sedute; per giorno UTC ne
       avrebbe 354, dieci delle quali sono lunedì a Roma (le riaperture della
       domenica sera del CME, che in UTC cadono di domenica). */
    const byDay = new Map<string, Decimal>();
    for (const row of rows) {
      const day = giornoDiBucketing(row.closedAt!);
      byDay.set(day, (byDay.get(day) ?? new Decimal(0)).plus(row.netPnl));
    }
    const daily = [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, netPnl]) => ({ day, netPnl: netPnl.toFixed(2), trades: 0 }));

    expect(daily.length).toBe(344);
    expect(maxDrawdown(daily, SIM1_INITIAL_BALANCE)).toEqual({
      maxDrawdown: "8840.10",
      maxDrawdownPct: "0.1467",
      date: "2025-03-14",
      avgDrawdown: "3041.45",
    });
  });
});

describe("SIM1 — il dataset esercita davvero ogni metrica", () => {
  it("copre più di 18 mesi", () => {
    const first = dataset[0].executions[0].executedAt;
    const last = dataset.at(-1)!.executions.at(-1)!.executedAt;
    const months =
      (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    expect(months).toBeGreaterThan(18);
  });

  it("ha quattro strumenti col valore punto reale del contratto", () => {
    const pointValues = new Map(
      dataset.map((t) => [t.symbol, t.pointValue] as const),
    );
    expect(Object.fromEntries(pointValues)).toEqual({
      ES: "50",
      NQ: "20",
      GC: "100",
      CL: "1000",
    });
  });

  it("mescola long e short", () => {
    const longs = dataset.filter((t) => t.direction === "LONG").length;
    expect(longs).toBeGreaterThan(dataset.length * 0.35);
    expect(longs).toBeLessThan(dataset.length * 0.65);
  });

  it("ha win rate fra 45% e 55% con expectancy positiva", () => {
    const rows = dataset.map(compute);
    const wins = rows.filter((r) => new Decimal(r.netPnl).gt(0)).length;
    const rate = wins / rows.length;
    expect(rate).toBeGreaterThanOrEqual(0.45);
    expect(rate).toBeLessThanOrEqual(0.55);
    const net = rows.reduce((a, r) => a.plus(r.netPnl), new Decimal(0));
    expect(net.gt(0)).toBe(true);
  });

  it("ha stop, target e rischio su OGNI trade (la §3 ha sempre dati)", () => {
    for (const trade of [...dataset, ...openTrades]) {
      expect(new Decimal(trade.plannedStop).isFinite()).toBe(true);
      expect(new Decimal(trade.plannedTarget).isFinite()).toBe(true);
      expect(new Decimal(trade.initialRisk).gt(0)).toBe(true);
      expect(new Decimal(trade.targetR).gt(0)).toBe(true);
      expect(compute(trade).rMultiple).not.toBeNull();
    }
  });

  it("il target R del piano è coerente coi prezzi salvati", () => {
    for (const trade of dataset) {
      const entry = new Decimal(trade.executions[0].price);
      const risk = entry.minus(trade.plannedStop).abs();
      const reward = new Decimal(trade.plannedTarget).minus(entry).abs();
      expect(reward.div(risk).toFixed(4)).toBe(trade.targetR);
    }
  });

  it("copre più bucket di target R (≤1R, 1-2R, 2-3R, >3R)", () => {
    const buckets = new Set(
      dataset.map((t) => {
        const r = Number(t.targetR);
        if (r <= 1) return "≤1R";
        if (r <= 2) return "1-2R";
        if (r <= 3) return "2-3R";
        return ">3R";
      }),
    );
    expect(buckets.size).toBe(4);
  });

  it("l'hit rate cala al crescere del target R (il senso della §3)", () => {
    // Un'uscita al target è un ordine LIMITE: si riempie AL prezzo target.
    // Se il dataset facesse uscire i "target raggiunti" appena prima, il
    // prezzo non toccherebbe mai il target e l'hit rate sarebbe ~0 — che è
    // esattamente il difetto trovato costruendo questa analisi.
    const buckets = new Map<string, { n: number; hits: number }>();
    for (const trade of dataset) {
      const computed = compute(trade);
      const target = new Decimal(trade.plannedTarget);
      const exit = new Decimal(computed.avgExitPrice!);
      const sign = trade.direction === "LONG" ? 1 : -1;
      const hit = exit.minus(target).times(sign).gte(0);
      const tr = Number(computed.targetR);
      const key = tr <= 1 ? "le1" : tr <= 2 ? "1to2" : tr <= 3 ? "2to3" : "gt3";
      const bucket = buckets.get(key) ?? { n: 0, hits: 0 };
      bucket.n += 1;
      if (hit) bucket.hits += 1;
      buckets.set(key, bucket);
    }
    const rate = (key: string) => {
      const b = buckets.get(key)!;
      return b.hits / b.n;
    };
    // Tutti e quattro i bucket sono popolati e l'hit rate scende.
    expect([...buckets.keys()].sort()).toEqual(["1to2", "2to3", "gt3", "le1"]);
    expect(rate("le1")).toBeGreaterThan(rate("1to2"));
    expect(rate("1to2")).toBeGreaterThan(rate("gt3"));
    // E resta un hit rate VERO, non zero per un artefatto di generazione.
    expect(rate("le1")).toBeGreaterThan(0.4);
    expect(rate("gt3")).toBeGreaterThan(0);
  });

  it("ha streak lunghe, in vittoria e in perdita", () => {
    const outcomes = dataset.map((t) =>
      new Decimal(compute(t).netPnl).gt(0) ? "W" : "L",
    );
    let current = "";
    let run = 0;
    let maxWin = 0;
    let maxLoss = 0;
    for (const outcome of outcomes) {
      run = outcome === current ? run + 1 : 1;
      current = outcome;
      if (outcome === "W") maxWin = Math.max(maxWin, run);
      else maxLoss = Math.max(maxLoss, run);
    }
    expect(maxWin).toBeGreaterThanOrEqual(6);
    expect(maxLoss).toBeGreaterThanOrEqual(6);
    // Una serie assurdamente lunga tradirebbe dati sintetici mal calibrati.
    expect(maxWin).toBeLessThanOrEqual(12);
    expect(maxLoss).toBeLessThanOrEqual(12);
  });

  it("ha hold time da pochi minuti a più giorni (bucket di durata)", () => {
    const minutes = dataset.map(
      (t) =>
        (t.executions.at(-1)!.executedAt.getTime() -
          t.executions[0].executedAt.getTime()) /
        60000,
    );
    expect(Math.min(...minutes)).toBeLessThan(30);
    expect(Math.max(...minutes)).toBeGreaterThan(1440);
  });

  it("ha fee su ogni esecuzione (il netto non è mai il lordo)", () => {
    for (const trade of dataset) {
      expect(new Decimal(trade.expectedFees).gt(0)).toBe(true);
      expect(trade.expectedNetPnl).not.toBe(trade.expectedGrossPnl);
    }
  });

  it("ha trade con uscita in più tranche (scale-out)", () => {
    const scaled = dataset.filter((t) => t.executions.length > 2);
    expect(scaled.length).toBeGreaterThan(5);
  });

  it("le posizioni aperte non hanno uscita e costano solo le fee", () => {
    for (const trade of openTrades) {
      const computed = compute(trade);
      expect(computed.status).toBe("OPEN");
      expect(computed.closedAt).toBeNull();
      expect(computed.netPnl).toBe(trade.expectedNetPnl);
      expect(new Decimal(computed.netPnl).lt(0)).toBe(true);
    }
  });
});
