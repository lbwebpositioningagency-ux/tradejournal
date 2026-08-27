import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { buildSim1Dataset } from "@/lib/demo/sim1-dataset";
import { computeTrade } from "@/lib/trade-compute";
import {
  DURATION_BUCKETS,
  SMALL_SAMPLE_THRESHOLD,
  bestAndWorst,
  fillDurationSegments,
  fillHourSegments,
  hourLabel,
  segmentMetrics,
  type SegmentAggregates,
} from "./segment-performance";

/**
 * Golden test su SIM1 (200 trade chiusi, dati noti e deterministici): i
 * valori attesi qui sotto sono stati calcolati dal dataset reale, non
 * inventati. Se una formula cambia, o se cambiano i confini dei bucket,
 * questi numeri si spostano e il test cade.
 */

const dataset = buildSim1Dataset();
const computed = dataset.map((t) => ({
  trade: t,
  c: computeTrade(t.executions, {
    pointValue: t.pointValue,
    initialRisk: t.initialRisk,
    plannedStop: t.plannedStop,
    plannedTarget: t.plannedTarget,
  }),
}));

/** Aggrega come farebbe la query SQL, per alimentare il modulo puro. */
function aggregate(rows: typeof computed): SegmentAggregates {
  const net = rows.reduce((a, r) => a.plus(r.c.netPnl), new Decimal(0));
  const wins = rows.filter((r) => new Decimal(r.c.netPnl).gt(0));
  const losses = rows.filter((r) => new Decimal(r.c.netPnl).lt(0));
  return {
    total: rows.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: rows.length - wins.length - losses.length,
    netPnl: net.toFixed(2),
    winSum: wins.reduce((a, r) => a.plus(r.c.netPnl), new Decimal(0)).toFixed(2),
    lossSum: losses
      .reduce((a, r) => a.plus(r.c.netPnl), new Decimal(0))
      .toFixed(2),
    rSum: rows
      .reduce((a, r) => a.plus(r.c.rMultiple ?? 0), new Decimal(0))
      .toFixed(4),
    rCount: rows.filter((r) => r.c.rMultiple !== null).length,
  };
}

function durationBucketOf(seconds: number): string {
  const index = DURATION_BUCKETS.findIndex(
    (b) => b.maxSeconds === null || seconds < b.maxSeconds,
  );
  return DURATION_BUCKETS[index].key;
}

const durationRows = DURATION_BUCKETS.map((b) => ({
  bucket: b.key,
  ...aggregate(
    computed.filter(
      (r) =>
        durationBucketOf(
          (r.c.closedAt!.getTime() - r.c.openedAt.getTime()) / 1000,
        ) === b.key,
    ),
  ),
}));

describe("segmentMetrics", () => {
  const base: SegmentAggregates = {
    total: 10,
    wins: 6,
    losses: 4,
    breakevens: 0,
    netPnl: "500.00",
    winSum: "900.00",
    lossSum: "-400.00",
    rSum: "3.0000",
    rCount: 10,
  };

  it("deriva i tassi dalle formule esistenti, non da aritmetica nuova", () => {
    const m = segmentMetrics(base);
    expect(m.winRate).toBe("0.6000");
    expect(m.avgR).toBe("0.3000");
    expect(m.profitFactor).toBe("2.2500");
  });

  it("un segmento vuoto non ha tassi: null, mai zero finto", () => {
    const m = segmentMetrics({ ...base, total: 0, wins: 0, losses: 0, rCount: 0 });
    expect(m.winRate).toBeNull();
    expect(m.avgR).toBeNull();
    expect(m.expectancy).toBeNull();
    expect(m.empty).toBe(true);
    // Vuoto NON è "campione ridotto": sono due cose diverse.
    expect(m.smallSample).toBe(false);
  });

  it("marca i campioni sotto soglia, e non quelli sopra", () => {
    expect(segmentMetrics({ ...base, total: 3 }).smallSample).toBe(true);
    expect(
      segmentMetrics({ ...base, total: SMALL_SAMPLE_THRESHOLD }).smallSample,
    ).toBe(false);
  });

  it("l'R medio usa i soli trade CON rischio come denominatore", () => {
    // 3R su 6 trade con rischio = 0,5R — non 3/10.
    const m = segmentMetrics({ ...base, rCount: 6 });
    expect(m.avgR).toBe("0.5000");
  });

  it("senza trade con rischio l'R medio è null, non zero", () => {
    expect(segmentMetrics({ ...base, rSum: "0", rCount: 0 }).avgR).toBeNull();
  });
});

describe("fasce orarie", () => {
  it("etichetta le fasce, inclusa la mezzanotte e l'ultima", () => {
    expect(hourLabel(0)).toBe("00-01");
    expect(hourLabel(9)).toBe("09-10");
    expect(hourLabel(23)).toBe("23-24");
  });

  it("riempie sempre tutte e 24 le fasce", () => {
    const segments = fillHourSegments([]);
    expect(segments).toHaveLength(24);
    expect(segments.every((s) => s.empty)).toBe(true);
    expect(segments.map((s) => s.hour)).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
  });

  it("nessun trade va perso nella distribuzione oraria (SIM1)", () => {
    const rows: (SegmentAggregates & { hour: number })[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const bucket = computed.filter((r) => r.c.openedAt.getUTCHours() === hour);
      if (bucket.length > 0) rows.push({ hour, ...aggregate(bucket) });
    }
    const segments = fillHourSegments(rows);
    expect(segments.reduce((a, s) => a + s.total, 0)).toBe(dataset.length);
    // SIM1 concentra l'operatività su alcune fasce: il resto resta vuoto,
    // ed è un'informazione ("a quell'ora non opero"), non un buco da nascondere.
    expect(segments.filter((s) => !s.empty).length).toBe(15);
  });
});

describe("bucket di durata — golden su SIM1", () => {
  const segments = fillDurationSegments(durationRows);

  it("nessun trade perso e nessun bucket vuoto coi confini ricalibrati", () => {
    expect(segments.reduce((a, s) => a + s.total, 0)).toBe(dataset.length);
    expect(segments.every((s) => !s.empty)).toBe(true);
  });

  it("nessun bucket domina: era il difetto dei confini di partenza", () => {
    // Coi confini proposti nel brief, "1-4h" prendeva il 68% dei trade
    // dell'utente demo e "<5 min" restava vuoto in entrambi i dataset.
    const max = Math.max(...segments.map((s) => s.total));
    expect(max / dataset.length).toBeLessThan(0.35);
  });

  it("conteggi per fascia (valori noti dal dataset)", () => {
    /* Spostati il 27/08/2026 con la rigenerazione del seed: le durate ora si
       contano in minuti di SEDUTA, quindi uno swing che attraversa un fine
       settimana dura di più in ore d'orologio e cambia fascia. Le fasce sono
       le stesse e nessuna si svuota — cambia la distribuzione dentro. */
    expect(segments.map((s) => s.total)).toEqual([50, 85, 60, 123, 88, 111, 106]);
  });

  it("metriche della fascia più profittevole", () => {
    const unaDueOre = segments.find((s) => s.bucket === "1to2h")!;
    expect(unaDueOre.label).toBe("1-2 h");
    expect(unaDueOre.winRate).toBe("0.5447");
    expect(unaDueOre.avgR).toBe("0.3838");
    expect(unaDueOre.expectancy).toBe("174.69");
    expect(unaDueOre.netPnl).toBe("21486.60");
  });

  it("metriche della fascia peggiore", () => {
    // Peggiore per R medio, NON in perdita: anche questo è un caso che la
    // UI deve saper mostrare senza drammatizzarlo (verde tenue, non rosso).
    const mezzora = segments.find((s) => s.bucket === "30to60m")!;
    expect(mezzora.winRate).toBe("0.4667");
    expect(mezzora.avgR).toBe("0.1071");
    expect(mezzora.netPnl).toBe("1435.20");
  });

  it("la relazione durata→rendimento non è monotona: la metrica non ha pregiudizi", () => {
    // Sul dataset attuale il picco dell'R medio sta nelle fasce CENTRALI
    // (15-30m e 1-2h), non agli estremi: né "i trade lunghi rendono peggio"
    // né il suo contrario. Il modulo mostra i dati, non una tesi — e questo
    // test fissa proprio l'assenza di monotonia.
    const byKey = new Map(segments.map((s) => [s.bucket, Number(s.avgR)]));
    expect(byKey.get("1to2h")!).toBeGreaterThan(byKey.get("lt15m")!);
    expect(byKey.get("1to2h")!).toBeGreaterThan(byKey.get("gt12h")!);
  });
});

describe("bestAndWorst", () => {
  const segments = fillDurationSegments(durationRows);

  it("trova il migliore e il peggiore per R medio", () => {
    const { best, worst } = bestAndWorst(segments, (s) => s.avgR);
    expect(best!.bucket).toBe("1to2h");
    expect(worst!.bucket).toBe("30to60m");
  });

  it("esclude i campioni ridotti dal confronto, salvo richiesta esplicita", () => {
    const conRumore = [
      ...segments,
      {
        ...segmentMetrics({
          total: 2,
          wins: 2,
          losses: 0,
          breakevens: 0,
          netPnl: "9999",
          winSum: "9999",
          lossSum: "0",
          rSum: "40",
          rCount: 2,
        }),
        bucket: "gt12h" as const,
        label: "fascia rumorosa",
      },
    ];
    // Due trade fortunati non devono diventare "la fascia migliore".
    expect(bestAndWorst(conRumore, (s) => s.avgR).best!.label).toBe("1-2 h");
    expect(
      bestAndWorst(conRumore, (s) => s.avgR, { includeSmallSamples: true }).best!
        .label,
    ).toBe("fascia rumorosa");
  });

  it("senza segmenti utilizzabili non inventa un vincitore", () => {
    const { best, worst } = bestAndWorst(fillDurationSegments([]), (s) => s.avgR);
    expect(best).toBeNull();
    expect(worst).toBeNull();
  });
});
