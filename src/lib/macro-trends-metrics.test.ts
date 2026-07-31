import { describe, expect, it } from "vitest";
import type { FredObservation } from "@/lib/fred";
import {
  computeSeriesMetrics,
  cycleMetric,
  linearSlope,
  MIN_HISTORY_SAMPLES,
  percentileAllHistory,
  periodChanges,
  prevailingLabel,
  stdDev,
  trendMetric,
} from "@/lib/macro-trends-metrics";
import { daysToDateKey, dateKeyToDays } from "@/lib/macro-trends-transforms";

/** Osservazioni mensili consecutive (primo del mese) a partire da start. */
function monthly(values: number[], start = "2019-01"): FredObservation[] {
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  return values.map((value) => {
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    return { date, value };
  });
}

/** Osservazioni a passo fisso di giorni a partire da una data. */
function everyDays(
  values: number[],
  stepDays: number,
  start = "2024-01-01",
): FredObservation[] {
  const startDays = dateKeyToDays(start);
  return values.map((value, i) => ({
    date: daysToDateKey(startDays + i * stepDays),
    value,
  }));
}

describe("linearSlope", () => {
  it("retta perfetta → pendenza per passo", () => {
    expect(linearSlope([1, 2, 3, 4])).toBe(1);
    expect(linearSlope([10, 8, 6, 4, 2])).toBe(-2);
  });

  it("serie costante → 0; meno di 2 punti → null", () => {
    expect(linearSlope([5, 5, 5])).toBe(0);
    expect(linearSlope([5])).toBeNull();
    expect(linearSlope([])).toBeNull();
  });
});

describe("stdDev", () => {
  it("popolazione: [1,3] → 1; costante → 0", () => {
    expect(stdDev([1, 3])).toBe(1);
    expect(stdDev([2, 2, 2])).toBe(0);
  });

  it("meno di 2 valori → null", () => {
    expect(stdDev([7])).toBeNull();
    expect(stdDev([])).toBeNull();
  });
});

describe("trendMetric", () => {
  it("salita netta nelle ultime 6 vs storia calma → rialzista con z > 0,5", () => {
    // 24 osservazioni con rumore ±0,1 poi 6 in salita di +1 a passo.
    const noise = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0 : 0.1));
    const rise = [1, 2, 3, 4, 5, 6];
    const result = trendMetric(monthly([...noise, ...rise]));
    expect(result?.label).toBe("rialzista");
    expect(result!.z).toBeGreaterThan(0.5);
  });

  it("discesa netta → ribassista con z < -0,5", () => {
    const noise = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0 : 0.1));
    const fall = [-1, -2, -3, -4, -5, -6];
    const result = trendMetric(monthly([...noise, ...fall]));
    expect(result?.label).toBe("ribassista");
    expect(result!.z).toBeLessThan(-0.5);
  });

  it("ultime 6 piatte con storia mossa → laterale (z ≈ 0)", () => {
    // Diffs storici ±1 (sd = 1), finale piatto: pendenza 0.
    const wobble = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const flat = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const result = trendMetric(monthly([...wobble, ...flat]));
    expect(result?.label).toBe("laterale");
    expect(Math.abs(result!.z)).toBeLessThan(0.5);
  });

  it("serie costante (sd variazioni = 0) → laterale, non divisione per zero", () => {
    const result = trendMetric(monthly(Array(30).fill(3)));
    expect(result).toEqual({ label: "laterale", z: 0, slope: 0 });
  });

  it("storia troppo corta → null", () => {
    expect(trendMetric(monthly([1, 2, 3, 4, 5, 6]))).toBeNull();
    expect(trendMetric([])).toBeNull();
  });
});

describe("periodChanges", () => {
  it("mensile abs: MoM e YoY dalla stessa serie", () => {
    // 25 mesi che salgono di 1: MoM = 1, YoY = 12.
    const obs = monthly(Array.from({ length: 25 }, (_, i) => i));
    const [mom, yoy] = periodChanges(obs, "monthly", "abs");
    expect(mom).toEqual({ label: "MoM", value: 1, pct: false });
    expect(yoy.label).toBe("YoY");
    expect(yoy.value).toBe(12);
  });

  it("mensile pct: variazione percentuale sul valore di un anno fa", () => {
    const obs = monthly(Array.from({ length: 13 }, (_, i) => 100 + i * 10));
    const [mom, yoy] = periodChanges(obs, "monthly", "pct");
    // ultimo 220, precedente 210, un anno fa 100.
    expect(mom.value).toBeCloseTo((10 / 210) * 100, 10);
    expect(yoy.value).toBeCloseTo(120, 10);
  });

  it("pct con base 0 → null, mai infinito", () => {
    const values = Array.from({ length: 13 }, () => 5);
    values[0] = 0; // base YoY
    const obs = monthly(values);
    const [, yoy] = periodChanges(obs, "monthly", "pct");
    expect(yoy.value).toBeNull();
  });

  it("trimestrale: QoQ su osservazione precedente, YoY a 4 trimestri", () => {
    const obs = everyDays([10, 20, 30, 40, 50, 60], 91, "2024-01-01");
    const [qoq, yoy] = periodChanges(obs, "quarterly", "abs");
    expect(qoq).toEqual({ label: "QoQ", value: 10, pct: false });
    expect(yoy.label).toBe("YoY");
    expect(yoy.value).toBe(40); // 60 - 20 (4 trimestri ≈ 364 giorni)
  });

  it("daily: 1 settimana e 1 mese indietro", () => {
    const obs = everyDays(
      Array.from({ length: 40 }, (_, i) => i),
      1,
    );
    const [w1, m1] = periodChanges(obs, "daily", "abs");
    expect(w1).toEqual({ label: "1S", value: 7, pct: false });
    expect(m1).toEqual({ label: "1M", value: 30, pct: false });
  });

  it("weekly: aggancia le osservazioni reali più vicine (7 e ~28 giorni)", () => {
    const obs = everyDays([0, 1, 2, 3, 4, 5, 6, 7], 7);
    const [w1, m1] = periodChanges(obs, "weekly", "abs");
    expect(w1.value).toBe(1); // osservazione a -7 giorni esatti
    expect(m1.value).toBe(4); // -28 giorni: la più vicina a -30
  });

  it("serie con una sola osservazione → entrambe null", () => {
    const [a, b] = periodChanges(monthly([1]), "monthly", "abs");
    expect(a.value).toBeNull();
    expect(b.value).toBeNull();
  });
});

describe("percentileAllHistory", () => {
  it("ultimo = massimo storico → 100; ultimo = minimo → percentile minimo", () => {
    const rising = monthly(Array.from({ length: 20 }, (_, i) => i));
    expect(percentileAllHistory(rising)).toBe(100);
    const falling = monthly(Array.from({ length: 20 }, (_, i) => 20 - i));
    expect(percentileAllHistory(falling)).toBe(5); // 1/20
  });

  it("meno di MIN_HISTORY_SAMPLES osservazioni → null", () => {
    const short = monthly(Array.from({ length: MIN_HISTORY_SAMPLES - 1 }, () => 1));
    expect(percentileAllHistory(short)).toBeNull();
  });
});

describe("cycleMetric", () => {
  // Storia bilanciata attorno a 0 con ultimo valore sopra/sotto la media.
  const base = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? -1 : 1));

  it("quadranti: sopra+salita espansione · sopra+discesa rallentamento", () => {
    const obs = monthly([...base, 2]);
    expect(cycleMetric(obs, 1, "up")?.label).toBe("espansione");
    expect(cycleMetric(obs, -1, "up")?.label).toBe("rallentamento");
  });

  it("quadranti: sotto+discesa contrazione · sotto+salita ripresa", () => {
    const obs = monthly([...base, -2]);
    expect(cycleMetric(obs, -1, "up")?.label).toBe("contrazione");
    expect(cycleMetric(obs, 1, "up")?.label).toBe("ripresa");
  });

  it("goodDirection down: disoccupazione sintetica alta e in salita → contrazione, non espansione", () => {
    // Serie stile UNRATE: storia attorno al 4-5%, ultimo valore ben sopra la
    // media e pendenza positiva. Con la semantica economica invertita il
    // quadrante è deterioramento (contrazione), mai "espansione" verde.
    const unemployment = monthly([...base.map((v) => v + 4.5), 6.5]);
    expect(cycleMetric(unemployment, 1, "down")?.label).toBe("contrazione");
    // Alta ma in discesa = ripresa; bassa e in discesa = espansione;
    // bassa ma in risalita = rallentamento (mappa completa del rilievo).
    expect(cycleMetric(unemployment, -1, "down")?.label).toBe("ripresa");
    const low = monthly([...base.map((v) => v + 4.5), 3]);
    expect(cycleMetric(low, -1, "down")?.label).toBe("espansione");
    expect(cycleMetric(low, 1, "down")?.label).toBe("rallentamento");
  });

  it("goodDirection down: il levelZ resta il posizionamento statistico grezzo", () => {
    const obs = monthly([...base, 2]);
    const up = cycleMetric(obs, 1, "up");
    const down = cycleMetric(obs, 1, "down");
    expect(down?.levelZ).toBe(up?.levelZ);
    expect(down!.levelZ).toBeGreaterThan(0);
  });

  it("goodDirection neutral (tassi, breakeven): nessun ciclo → non vota", () => {
    const obs = monthly([...base, 2]);
    expect(cycleMetric(obs, 1, "neutral")).toBeNull();
  });

  it("serie costante (sd = 0) o corta → null", () => {
    expect(cycleMetric(monthly(Array(30).fill(4)), 1, "up")).toBeNull();
    expect(cycleMetric(monthly([1, 2, 3]), 1, "up")).toBeNull();
  });
});

describe("prevailingLabel", () => {
  it("maggioranza netta → winner con conteggi giusti", () => {
    const res = prevailingLabel([
      "espansione",
      "espansione",
      "ripresa",
      "espansione",
      "contrazione",
    ]);
    expect(res).toEqual({
      winner: "espansione",
      tie: false,
      count: 3,
      total: 5,
    });
  });

  it("i null (indicatori sotto soglia) non votano", () => {
    const res = prevailingLabel(["ripresa", null, "ripresa", null]);
    expect(res).toEqual({ winner: "ripresa", tie: false, count: 2, total: 2 });
  });

  it("pareggio in testa → winner null e tie=true, mai scelta arbitraria", () => {
    const res = prevailingLabel(["espansione", "contrazione"]);
    expect(res.winner).toBeNull();
    expect(res.tie).toBe(true);
    expect(res.count).toBe(1);
    expect(res.total).toBe(2);
    // Il pareggio 2-2 con un terzo sotto non è "vinto" dal terzo.
    const res2 = prevailingLabel([
      "espansione",
      "espansione",
      "ripresa",
      "ripresa",
      "contrazione",
    ]);
    expect(res2.winner).toBeNull();
    expect(res2.tie).toBe(true);
    expect(res2.count).toBe(2);
  });

  it("tutti null o lista vuota → total 0 (pillola N/D)", () => {
    expect(prevailingLabel([null, null])).toEqual({
      winner: null,
      tie: false,
      count: 0,
      total: 0,
    });
    expect(prevailingLabel([])).toEqual({
      winner: null,
      tie: false,
      count: 0,
      total: 0,
    });
  });

  it("voto singolo → winner con 1 di 1", () => {
    expect(prevailingLabel(["laterale"])).toEqual({
      winner: "laterale",
      tie: false,
      count: 1,
      total: 1,
    });
  });
});

describe("computeSeriesMetrics", () => {
  const obs = monthly(Array.from({ length: 36 }, (_, i) => i), "2020-01");

  it("assembla tutte le metriche con l'anno di partenza dichiarato", () => {
    const m = computeSeriesMetrics(obs, {
      cadence: "monthly",
      deltaMode: "abs",
      includeCycle: true,
      goodDirection: "up",
    });
    expect(m.trend).toBe("rialzista");
    expect(m.changes.map((c) => c.label)).toEqual(["MoM", "YoY"]);
    expect(m.percentile).toBe(100);
    expect(m.historyStartYear).toBe("2020");
    expect(m.cycle).toBe("espansione");
    expect(m.levelZ).toBeGreaterThan(0);
  });

  it("includeCycle=false (Volatilità) → niente ciclo, il resto sì", () => {
    const m = computeSeriesMetrics(obs, {
      cadence: "monthly",
      deltaMode: "abs",
      includeCycle: false,
      goodDirection: "up",
    });
    expect(m.cycle).toBeNull();
    expect(m.levelZ).toBeNull();
    expect(m.trend).toBe("rialzista");
    expect(m.percentile).toBe(100);
  });

  it("goodDirection neutral → niente ciclo né levelZ, il resto sì", () => {
    const m = computeSeriesMetrics(obs, {
      cadence: "monthly",
      deltaMode: "abs",
      includeCycle: true,
      goodDirection: "neutral",
    });
    expect(m.cycle).toBeNull();
    expect(m.levelZ).toBeNull();
    expect(m.trend).toBe("rialzista");
  });

  it("serie vuota → tutto null senza crash", () => {
    const m = computeSeriesMetrics([], {
      cadence: "daily",
      deltaMode: "abs",
      includeCycle: true,
      goodDirection: "up",
    });
    expect(m.trend).toBeNull();
    expect(m.percentile).toBeNull();
    expect(m.historyStartYear).toBeNull();
    expect(m.cycle).toBeNull();
    expect(m.changes.every((c) => c.value === null)).toBe(true);
  });
});
