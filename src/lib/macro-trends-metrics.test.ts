import { describe, expect, it } from "vitest";
import type { FredObservation } from "@/lib/fred";
import {
  computeSeriesMetrics,
  levelZMetric,
  linearSlope,
  MIN_HISTORY_SAMPLES,
  percentileAllHistory,
  periodChanges,
  slopeNoiseFactor,
  stdDev,
  TREND_WINDOW,
  TREND_Z_THRESHOLD,
  trendMetric,
} from "@/lib/macro-trends-metrics";
import { mulberry32 } from "@/lib/metrics/monte-carlo";
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

describe("slopeNoiseFactor — derivazione in forma chiusa (Q-03)", () => {
  it("finestra 6: √(64,75/306,25) ≈ 0,4598 — il «sd(slope) ≈ 0,46σ» del rilievo", () => {
    // Derivazione: pesi wᵢ = (i−2,5)/17,5, cₖ = Σ_{i≥k} wᵢ →
    // numeratori (2,5 · 4 · 4,5 · 4 · 2,5), Σc² = 64,75/17,5².
    expect(slopeNoiseFactor(6)).toBeCloseTo(Math.sqrt(64.75) / 17.5, 12);
    expect(slopeNoiseFactor(TREND_WINDOW)).toBeCloseTo(0.4598, 4);
  });

  it("la soglia è il quantile 95% della normale (~10% di falsi trend a due code)", () => {
    expect(TREND_Z_THRESHOLD).toBeCloseTo(1.645, 3);
  });
});

describe("trendMetric", () => {
  it("salita netta nelle ultime 6 vs storia calma → rialzista sopra la soglia", () => {
    // 24 osservazioni con rumore ±0,1 poi 6 in salita di +1 a passo.
    const noise = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0 : 0.1));
    const rise = [1, 2, 3, 4, 5, 6];
    const result = trendMetric(monthly([...noise, ...rise]));
    expect(result?.label).toBe("rialzista");
    expect(result!.z).toBeGreaterThan(TREND_Z_THRESHOLD);
  });

  it("discesa netta → ribassista sotto la soglia negativa", () => {
    const noise = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0 : 0.1));
    const fall = [-1, -2, -3, -4, -5, -6];
    const result = trendMetric(monthly([...noise, ...fall]));
    expect(result?.label).toBe("ribassista");
    expect(result!.z).toBeLessThan(-TREND_Z_THRESHOLD);
  });

  it("ultime 6 piatte con storia mossa → laterale (z ≈ 0)", () => {
    // Diffs storici ±1 (sd = 1), finale piatto: pendenza 0.
    const wobble = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const flat = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const result = trendMetric(monthly([...wobble, ...flat]));
    expect(result?.label).toBe("laterale");
    expect(Math.abs(result!.z)).toBeLessThan(TREND_Z_THRESHOLD);
  });

  it("Q-03 — Monte Carlo: su una passeggiata aleatoria SENZA trend l'etichetta esce ~10% delle volte", () => {
    // 1000 passeggiate aleatorie di 84 osservazioni mensili (la finestra
    // recente di 5 anni resta sopra il gate), passi ~N(0,1) via Box-Muller
    // con RNG deterministico. Con la vecchia normalizzazione (z = slope/σ,
    // soglia 0,5) il tasso di falsi trend era ~28%: la taratura corretta
    // deve stare intorno al 10% dichiarato (z è una t con ~59 gdl, non una
    // normale esatta: tolleranza [6%, 14%]).
    const rng = mulberry32(20260731);
    const normal = () =>
      Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    let falseTrends = 0;
    const walks = 1000;
    for (let w = 0; w < walks; w += 1) {
      let level = 0;
      const values: number[] = [level];
      for (let i = 1; i < 84; i += 1) {
        level += normal();
        values.push(level);
      }
      const result = trendMetric(monthly(values, "2016-01"));
      if (result !== null && result.label !== "laterale") falseTrends += 1;
    }
    const rate = falseTrends / walks;
    expect(rate).toBeGreaterThan(0.06);
    expect(rate).toBeLessThan(0.14);
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

describe("levelZMetric", () => {
  // Storia bilanciata attorno a 0 con ultimo valore sopra/sotto la media.
  const base = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? -1 : 1));

  it("sopra la media del regime → z positivo; sotto → negativo", () => {
    expect(levelZMetric(monthly([...base, 2]), "up")!).toBeGreaterThan(0);
    expect(levelZMetric(monthly([...base, -2]), "up")!).toBeLessThan(0);
  });

  it("goodDirection non inverte il livello: resta il posizionamento grezzo", () => {
    /* Era il punto delicato quando esisteva il quadrante: la semantica
       economica invertiva l'etichetta, MAI il numero. Ora che l'etichetta
       non c'è più, il numero deve restare quello di prima. */
    const obs = monthly([...base, 2]);
    expect(levelZMetric(obs, "down")).toBe(levelZMetric(obs, "up"));
  });

  it("goodDirection neutral (tassi, breakeven): nessun levelZ", () => {
    /* Esclusione EREDITATA dal quadrante e tenuta di proposito: toglierla
       farebbe comparire un numero nuovo su nove serie di Tassi & Curva, che
       non è ciò che questa rimozione deve fare. */
    expect(levelZMetric(monthly([...base, 2]), "neutral")).toBeNull();
  });

  it("serie costante (sd = 0) o corta → null", () => {
    expect(levelZMetric(monthly(Array(30).fill(4)), "up")).toBeNull();
    expect(levelZMetric(monthly([1, 2, 3]), "up")).toBeNull();
  });

  it("Q-04 — il livello si confronta col regime degli ultimi 10 anni, non con l'intera storia", () => {
    // 20 anni a 10, poi ~10 anni a 2 con ultimo valore 3. Sul regime recente
    // (finestra 10A: i 2 e il 3 finale) il 3 è ALTO. Sulla storia intera
    // (media ≈ 7,3) sarebbe stato basso: il full-history confrontava con un
    // regime che non esiste più.
    const regime = monthly(
      [...Array(240).fill(10), ...Array(119).fill(2), 3],
      "1995-01",
    );
    expect(levelZMetric(regime, "up")!).toBeGreaterThan(0);
  });

  it("Q-04 — serie più corta di 10 anni: fallback dichiarato alla storia intera", () => {
    // 31 osservazioni (~2,6 anni): la finestra 10A coincide con la storia.
    expect(levelZMetric(monthly([...base, 2]), "up")!).toBeGreaterThan(0);
  });
});

describe("computeSeriesMetrics", () => {
  const obs = monthly(Array.from({ length: 36 }, (_, i) => i), "2020-01");

  it("assembla tutte le metriche con l'anno di partenza dichiarato", () => {
    const m = computeSeriesMetrics(obs, {
      cadence: "monthly",
      deltaMode: "abs",
      includeLevelZ: true,
      goodDirection: "up",
    });
    expect(m.trend).toBe("rialzista");
    expect(m.changes.map((c) => c.label)).toEqual(["MoM", "YoY"]);
    expect(m.percentile).toBe(100);
    expect(m.historyStartYear).toBe("2020");
    expect(m.levelZ).toBeGreaterThan(0);
  });

  it("includeLevelZ=false (Volatilità) → niente levelZ, il resto sì", () => {
    const m = computeSeriesMetrics(obs, {
      cadence: "monthly",
      deltaMode: "abs",
      includeLevelZ: false,
      goodDirection: "up",
    });
    expect(m.levelZ).toBeNull();
    expect(m.trend).toBe("rialzista");
    expect(m.percentile).toBe(100);
  });

  it("goodDirection neutral → niente levelZ, il resto sì", () => {
    const m = computeSeriesMetrics(obs, {
      cadence: "monthly",
      deltaMode: "abs",
      includeLevelZ: true,
      goodDirection: "neutral",
    });
    expect(m.levelZ).toBeNull();
    expect(m.trend).toBe("rialzista");
  });

  /* Il livello NON dipende dalla pendenza: col trend laterale — cioè quasi
     sempre, sulle serie macro — il levelZ resta ed è l'unica cosa che questa
     pagina può dire onestamente sul posizionamento. */
  it("trend laterale → levelZ resta (è un fatto)", () => {
    /* Serie con rumore attorno a una salita lentissima: la pendenza è
       positiva, il test del trend non la distingue dal rumore. */
    const rumorosa = monthly(
      Array.from({ length: 60 }, (_, i) => 100 + i * 0.01 + (i % 2 ? 3 : -3)),
      "2020-01",
    );
    const m = computeSeriesMetrics(rumorosa, {
      cadence: "monthly",
      deltaMode: "abs",
      includeLevelZ: true,
      goodDirection: "up",
    });
    expect(m.trend).toBe("laterale");
    expect(m.levelZ).not.toBeNull();
  });

  it("serie vuota → tutto null senza crash", () => {
    const m = computeSeriesMetrics([], {
      cadence: "daily",
      deltaMode: "abs",
      includeLevelZ: true,
      goodDirection: "up",
    });
    expect(m.trend).toBeNull();
    expect(m.percentile).toBeNull();
    expect(m.historyStartYear).toBeNull();
    expect(m.levelZ).toBeNull();
    expect(m.changes.every((c) => c.value === null)).toBe(true);
  });
});
