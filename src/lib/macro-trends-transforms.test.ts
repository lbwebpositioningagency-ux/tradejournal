import { describe, expect, it } from "vitest";
import { parseFredCsv, parseFredJson } from "./fred";
import {
  applyTransform,
  comparisonRow,
  dateKeyToDays,
  daysToDateKey,
  indexAtOrBefore,
  isStale,
  momChange,
  nearestObservation,
  percentileRank,
  qoqAnnualized,
  thinObservations,
  windowForHorizon,
  yoy,
} from "./macro-trends-transforms";

const obs = (date: string, value: number) => ({ date, value });

/** Serie mensile regolare: primo del mese, valori crescenti di 1. */
function monthly(start: string, count: number, startValue = 100, step = 1) {
  const [y0, m0] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  return Array.from({ length: count }, (_, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const m = ((m0 - 1 + i) % 12) + 1;
    return obs(`${y}-${String(m).padStart(2, "0")}-01`, startValue + i * step);
  });
}

describe("parser FRED", () => {
  it("JSON: scarta '.' (mancante, mai zero) e valori non numerici", () => {
    const parsed = parseFredJson({
      observations: [
        { date: "2026-01-01", value: "3.5" },
        { date: "2026-02-01", value: "." },
        { date: "2026-03-01", value: "abc" },
        { date: "invalid", value: "1" },
        { date: "2026-04-01", value: "-0.2" },
      ],
    });
    expect(parsed).toEqual([
      obs("2026-01-01", 3.5),
      obs("2026-04-01", -0.2),
    ]);
  });

  it("JSON: payload malformato → lista vuota, mai crash", () => {
    expect(parseFredJson(null)).toEqual([]);
    expect(parseFredJson({ foo: 1 })).toEqual([]);
    expect(parseFredJson({ observations: "no" })).toEqual([]);
  });

  it("CSV: intestazione ignorata, '.' scartato, CRLF tollerato", () => {
    const csv = "observation_date,CPIAUCSL\r\n2026-01-01,321.5\r\n2026-02-01,.\r\n2026-03-01,323.1\r\n";
    expect(parseFredCsv(csv)).toEqual([
      obs("2026-01-01", 321.5),
      obs("2026-03-01", 323.1),
    ]);
  });
});

describe("date helpers e ricerca", () => {
  it("dateKeyToDays/daysToDateKey sono inversi", () => {
    expect(daysToDateKey(dateKeyToDays("2026-07-23"))).toBe("2026-07-23");
  });

  it("indexAtOrBefore: esatto, precedente, prima di tutto", () => {
    const series = [obs("2026-01-01", 1), obs("2026-02-01", 2), obs("2026-03-01", 3)];
    expect(indexAtOrBefore(series, dateKeyToDays("2026-02-01"))).toBe(1);
    expect(indexAtOrBefore(series, dateKeyToDays("2026-02-15"))).toBe(1);
    expect(indexAtOrBefore(series, dateKeyToDays("2025-12-31"))).toBe(-1);
  });

  it("nearestObservation: preferisce il più vicino (anche successivo), rispetta la tolleranza", () => {
    const series = [obs("2026-01-01", 1), obs("2026-02-01", 2)];
    // target 28/01: il 01/02 dista 4 giorni, il 01/01 ne dista 27.
    expect(
      nearestObservation(series, dateKeyToDays("2026-01-28"), 10)?.date,
    ).toBe("2026-02-01");
    // fuori tolleranza → null
    expect(nearestObservation(series, dateKeyToDays("2026-06-01"), 10)).toBeNull();
    expect(nearestObservation([], 0, 10)).toBeNull();
  });
});

describe("trasformazioni", () => {
  it("yoy su mensile regolare: 12 mesi indietro, in %", () => {
    const series = monthly("2024-01", 25); // 100..124
    const out = yoy(series);
    // Il primo punto possibile è dopo 12 mesi.
    expect(out[0].date).toBe("2025-01-01");
    expect(out[0].value).toBeCloseTo(12, 10); // 112/100
    expect(out[out.length - 1].value).toBeCloseTo((124 / 112 - 1) * 100, 10);
  });

  it("yoy con buco: usa l'osservazione reale più vicina entro tolleranza, mai interpolare", () => {
    const series = [
      obs("2024-01-01", 100),
      // 2024-02..2024-12 mancanti
      obs("2025-01-15", 110),
    ];
    const out = yoy(series); // default 15gg: il gap di 14 rientra
    // target 2024-01-15 → più vicino è 2024-01-01 (14 giorni): ok.
    expect(out).toHaveLength(1);
    expect(out[0].value).toBeCloseTo(10, 10);
    // Con tolleranza stretta il buco non si aggancia → serie vuota.
    expect(yoy(series, 5)).toHaveLength(0);
  });

  it("yoy: la tolleranza NON accetta confronti a 11 mesi (mai spacciarli per annuali)", () => {
    // Serie che inizia a gen 2024: per l'obs di dic 2024 il "−1 anno" non
    // esiste (gen 2024 dista 30 giorni dal target): niente punto.
    const series = monthly("2024-01", 13); // gen 2024..gen 2025
    const out = yoy(series);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2025-01-01");
  });

  it("yoy: serie troppo corta per il transform → vuota; base 0 scartata", () => {
    expect(yoy(monthly("2026-01", 3))).toHaveLength(0);
    const withZero = [obs("2025-01-01", 0), obs("2026-01-01", 5)];
    expect(yoy(withZero)).toHaveLength(0);
  });

  it("mom_change: differenza sull'osservazione precedente", () => {
    const out = momChange([obs("2026-01-01", 150), obs("2026-02-01", 175), obs("2026-03-01", 160)]);
    expect(out).toEqual([obs("2026-02-01", 25), obs("2026-03-01", -15)]);
    expect(momChange([obs("2026-01-01", 1)])).toHaveLength(0);
  });

  it("qoq_annualized: convenzione BEA (^4)", () => {
    const out = qoqAnnualized([obs("2026-01-01", 100), obs("2026-04-01", 101)]);
    expect(out[0].value).toBeCloseTo((1.01 ** 4 - 1) * 100, 10);
    expect(qoqAnnualized([obs("2026-01-01", 100)])).toHaveLength(0);
  });

  it("level e as_is: identità", () => {
    const series = [obs("2026-01-01", 1)];
    expect(applyTransform(series, "level")).toBe(series);
    expect(applyTransform(series, "as_is")).toBe(series);
  });
});

describe("percentileRank", () => {
  it("percentile dell'ultimo valore nella finestra, con minimo campione", () => {
    // 100 osservazioni giornaliere 1..100, ultimo = 100 → 100° pct.
    const series = Array.from({ length: 100 }, (_, i) =>
      obs(daysToDateKey(dateKeyToDays("2026-01-01") + i), i + 1),
    );
    expect(percentileRank(series, 1)).toBe(100);
    // Ultimo = mediana: ≤50 sono 1..50 PIÙ l'ultimo stesso → 51/100.
    const mid = [...series.slice(0, 99), obs(series[99].date, 50)];
    expect(percentileRank(mid, 1)).toBe(51);
    // Campione sotto soglia → null
    expect(percentileRank(series.slice(-10), 1)).toBeNull();
    expect(percentileRank([], 1)).toBeNull();
  });

  it("la finestra taglia davvero: valori vecchi fuori dal conteggio", () => {
    const old = Array.from({ length: 50 }, (_, i) =>
      obs(daysToDateKey(dateKeyToDays("2015-01-01") + i), 1000),
    );
    const recent = Array.from({ length: 30 }, (_, i) =>
      obs(daysToDateKey(dateKeyToDays("2026-01-01") + i), i + 1),
    );
    // Finestra 1 anno: i 1000 del 2015 non contano; ultimo (30) è il max.
    expect(percentileRank([...old, ...recent], 1)).toBe(100);
  });
});

describe("windowForHorizon", () => {
  const series = monthly("2010-01", 200); // ~16,6 anni
  it("Max = tutto; 1A/3A/5A/10A tagliano dalla data dell'ULTIMA osservazione", () => {
    expect(windowForHorizon(series, "Max")).toHaveLength(200);
    const w1 = windowForHorizon(series, "1A");
    expect(w1.length).toBeGreaterThanOrEqual(12);
    expect(w1.length).toBeLessThanOrEqual(13);
    const w10 = windowForHorizon(series, "10A");
    expect(w10.length).toBeGreaterThanOrEqual(120);
    expect(w10.length).toBeLessThanOrEqual(121);
  });
  it("serie più corta dell'orizzonte → tutta la serie", () => {
    const short = monthly("2026-01", 5);
    expect(windowForHorizon(short, "10A")).toHaveLength(5);
    expect(windowForHorizon([], "1A")).toHaveLength(0);
  });
});

describe("thinObservations", () => {
  it("prima e ultima sempre incluse, solo osservazioni reali", () => {
    const daily = Array.from({ length: 6000 }, (_, i) =>
      obs(daysToDateKey(dateKeyToDays("2010-01-01") + i), i),
    );
    const thin = thinObservations(daily, "daily");
    expect(thin[0]).toEqual(daily[0]);
    expect(thin[thin.length - 1]).toEqual(daily[daily.length - 1]);
    expect(thin.length).toBeLessThan(1600);
    const dates = new Set(daily.map((o) => o.date));
    expect(thin.every((o) => dates.has(o.date))).toBe(true);
    // L'ultimo anno resta a passo pieno.
    // L'ultimo anno resta quasi a passo pieno (il primo salto può cadere
    // a cavallo del confine di fascia).
    const lastYear = thin.filter(
      (o) => dateKeyToDays(o.date) > dateKeyToDays(daily[daily.length - 1].date) - 365,
    );
    expect(lastYear.length).toBeGreaterThanOrEqual(350);
  });

  it("serie mensili/corte passano intatte o quasi", () => {
    const m = monthly("2020-01", 60);
    const thin = thinObservations(m, "monthly");
    expect(thin.length).toBeGreaterThanOrEqual(58); // stride mai < 1
    expect(thinObservations(m.slice(0, 2), "monthly")).toHaveLength(2);
  });
});

describe("isStale", () => {
  const now = dateKeyToDays("2026-07-23");
  it("cadenze diverse, soglie diverse", () => {
    expect(isStale("2026-07-20", "daily", now)).toBe(false);
    expect(isStale("2026-07-01", "daily", now)).toBe(true);
    expect(isStale("2026-05-01", "monthly", now)).toBe(false);
    expect(isStale("2026-04-01", "monthly", now)).toBe(true);
    expect(isStale("2026-01-01", "quarterly", now)).toBe(false);
  });
});

describe("comparisonRow", () => {
  it("mensile: Ora/1M/3M/6M/1A agganciati alle osservazioni reali, Δ1A = now − y1", () => {
    const series = monthly("2025-01", 19); // 01/2025..07/2026, 100..118
    const row = comparisonRow(series, "monthly");
    expect(row.now).toMatchObject({ date: "2026-07-01", value: 118 });
    expect(row.m1?.date).toBe("2026-06-01");
    expect(row.m3?.date).toBe("2026-04-01");
    expect(row.m6?.date).toBe("2026-01-01");
    expect(row.y1?.date).toBe("2025-07-01");
    expect(row.deltaY1).toBe(12);
  });

  it("il punto esatto mancante usa il più vicino e ne dichiara lo scarto", () => {
    const series = [obs("2025-07-20", 50), obs("2026-07-23", 60)];
    const row = comparisonRow(series, "daily");
    // 1A fa = 2025-07-23: il 2025-07-20 dista 3 giorni (entro tolleranza 10).
    expect(row.y1).toMatchObject({ date: "2025-07-20", gapDays: 3 });
    expect(row.deltaY1).toBe(10);
    // 1M/3M/6M non hanno osservazioni vicine → null, mai inventati.
    expect(row.m1).toBeNull();
    expect(row.m3).toBeNull();
    expect(row.m6).toBeNull();
  });

  it("serie vuota o singola: mai crash", () => {
    expect(comparisonRow([], "daily").now).toBeNull();
    const single = comparisonRow([obs("2026-07-23", 5)], "daily");
    expect(single.now?.value).toBe(5);
    expect(single.y1).toBeNull();
    expect(single.deltaY1).toBeNull();
  });
});
