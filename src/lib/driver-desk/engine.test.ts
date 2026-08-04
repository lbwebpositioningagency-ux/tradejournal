import { describe, expect, it } from "vitest";
import {
  CHART_WINDOW_DAYS,
  MIN_SAMPLE,
  alignToCalendar,
  bandFromPercentile,
  cumulativeStandardizedIndex,
  currentVsHistory,
  dailyChanges,
  intersectCalendar,
  percentileStrict,
  relativeStrengthSeries,
  rollingCorrelation,
  rollingSum,
  sampleStats,
  windowStartIndex,
  zScore,
} from "@/lib/driver-desk/engine";

/**
 * VERIFICA INDIPENDENTE (metodo F2): per ogni blocco della spec almeno un
 * caso è ricostruito con un calcolo SEPARATO — formule scritte in modo
 * diverso (naive, a doppio ciclo) o numeri fatti a mano — e si pretende la
 * coincidenza. Se le due strade divergono, è il motore a essere sotto
 * accusa, mai il test.
 */

/** Generatore deterministico (LCG) per i confronti su dati "qualunque". */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* ───────────────────── Calendario (D5) ───────────────────── */

describe("intersectCalendar", () => {
  it("tiene solo i giorni presenti in TUTTE le serie", () => {
    const a = [
      { date: "2024-01-01", value: 1 },
      { date: "2024-01-02", value: 2 },
      { date: "2024-01-03", value: 3 },
    ];
    const b = [
      { date: "2024-01-02", value: 10 },
      { date: "2024-01-03", value: 11 },
      { date: "2024-01-04", value: 12 },
    ];
    const { dates, dropped } = intersectCalendar({ a, b });
    expect(dates).toEqual(["2024-01-02", "2024-01-03"]);
    // la storia FUORI dalla finestra comune non è "persa": è fuori per
    // costruzione (D6) e non deve gonfiare la dichiarazione D5
    expect(dropped).toEqual({ a: 0, b: 0 });
  });

  it("conta come perse solo le osservazioni DENTRO la finestra comune", () => {
    const a = [
      { date: "2024-01-01", value: 1 },
      { date: "2024-01-02", value: 2 }, // b non ce l'ha: persa per a
      { date: "2024-01-03", value: 3 },
      { date: "2024-01-05", value: 5 },
    ];
    const b = [
      { date: "2024-01-01", value: 10 },
      { date: "2024-01-03", value: 11 },
      { date: "2024-01-04", value: 12 }, // a non ce l'ha: persa per b
      { date: "2024-01-05", value: 13 },
    ];
    const { dates, dropped } = intersectCalendar({ a, b });
    expect(dates).toEqual(["2024-01-01", "2024-01-03", "2024-01-05"]);
    expect(dropped).toEqual({ a: 1, b: 1 });
  });

  it("senza serie restituisce calendario vuoto", () => {
    expect(intersectCalendar({}).dates).toEqual([]);
  });
});

describe("alignToCalendar", () => {
  it("lancia se il calendario chiede una data assente (mai forward-fill)", () => {
    expect(() =>
      alignToCalendar([{ date: "2024-01-01", value: 1 }], ["2024-01-02"]),
    ).toThrow(/assente/);
  });
});

/* ───────────────── Trasformazioni (spec §3.0) ───────────────── */

describe("dailyChanges", () => {
  it("logret: ln(P_t/P_{t-1}) — verificato a mano", () => {
    // ln(110/100) = 0.0953101…, ln(99/110) = −0.1053605…
    const out = dailyChanges([100, 110, 99], "logret");
    expect(out[0]).toBeCloseTo(0.0953101798, 8);
    expect(out[1]).toBeCloseTo(-0.1053605157, 8);
  });

  it("diff: differenza prima, i valori NEGATIVI sono dati legittimi", () => {
    // DFII10 e Bund sono stati negativi per anni: -0.5 → -1.1 = Δ -0.6
    const out = dailyChanges([-0.5, -1.1, 0.2], "diff");
    expect(out[0]).toBeCloseTo(-0.6, 10);
    expect(out[1]).toBeCloseTo(1.3, 10);
  });
});

/* ───────────────── Statistiche di base ───────────────── */

describe("sampleStats / zScore", () => {
  it("media e σ campionaria (n−1) — caso classico fatto a mano", () => {
    // [2,4,4,4,5,5,7,9]: μ=5, varianza campionaria 32/7 → σ=2.13809…
    const s = sampleStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.sd).toBeCloseTo(Math.sqrt(32 / 7), 10);
    // z di 9: (9−5)/2.13809 = 1.87082…
    expect(zScore(9, s)).toBeCloseTo(4 / Math.sqrt(32 / 7), 10);
  });

  it("σ=0 (tutti uguali) → sd null e z null, mai divisione per zero", () => {
    const s = sampleStats([3, 3, 3]);
    expect(s.sd).toBeNull();
    expect(zScore(3, s)).toBeNull();
  });

  it("campione vuoto o singolo → sd null", () => {
    expect(sampleStats([]).sd).toBeNull();
    expect(sampleStats([7]).sd).toBeNull();
  });
});

describe("percentileStrict", () => {
  it("quota con < stretto — fatto a mano", () => {
    // storia [1,2,3,4], x=3.5 → 3 sotto su 4 = 75%
    expect(percentileStrict([1, 2, 3, 4], 3.5)).toBe(75);
    // x uguale a un valore: 3 NON conta (< stretto) → 2/4 = 50%
    expect(percentileStrict([1, 2, 3, 4], 3)).toBe(50);
  });

  it("storia vuota → null, non 0", () => {
    expect(percentileStrict([], 1)).toBeNull();
  });
});

/* ───────────── Blocco A — forza nel paniere (spec §3.1) ───────────── */

describe("rollingSum", () => {
  it("coincide con la somma naive su dati qualunque", () => {
    const rnd = lcg(42);
    const xs = Array.from({ length: 200 }, () => rnd() - 0.5);
    const w = 20;
    const fast = rollingSum(xs, w);
    for (let i = 0; i < xs.length; i += 1) {
      if (i < w - 1) {
        expect(fast[i]).toBeNull();
      } else {
        // ricostruzione indipendente: somma esplicita della finestra
        let naive = 0;
        for (let j = i - w + 1; j <= i; j += 1) naive += xs[j];
        expect(fast[i]).toBeCloseTo(naive, 10);
      }
    }
  });
});

describe("relativeStrengthSeries", () => {
  it("caso a mano: W=2, un solo componente di paniere", () => {
    const main = [0.01, 0.02, -0.01];
    const basket = [[0.005, -0.005, 0.01]];
    const rs = relativeStrengthSeries(main, basket, 2);
    // t=1: (0.01+0.02) − (0.005−0.005) = 0.03
    // t=2: (0.02−0.01) − (−0.005+0.01) = 0.005
    expect(rs[0]).toBeNull();
    expect(rs[1]).toBeCloseTo(0.03, 12);
    expect(rs[2]).toBeCloseTo(0.005, 12);
  });

  it("verifica indipendente su dati qualunque, paniere a 3 componenti", () => {
    const rnd = lcg(7);
    const n = 150;
    const main = Array.from({ length: n }, () => (rnd() - 0.5) / 50);
    const basket = [0, 1, 2].map(() =>
      Array.from({ length: n }, () => (rnd() - 0.5) / 50),
    );
    const w = 20;
    const rs = relativeStrengthSeries(main, basket, w);
    for (let t = w - 1; t < n; t += 20) {
      // ricostruzione indipendente della formula della spec §3.1
      let mainCum = 0;
      for (let i = t - w + 1; i <= t; i += 1) mainCum += main[i];
      let basketMean = 0;
      for (const b of basket) {
        let c = 0;
        for (let i = t - w + 1; i <= t; i += 1) c += b[i];
        basketMean += c / basket.length;
      }
      expect(rs[t]).toBeCloseTo(mainCum - basketMean, 10);
    }
  });
});

/* ───────── Blocco C — correlazione rolling (spec §3.3) ───────── */

/** Pearson scritto in modo INDIPENDENTE (via momenti, non via scarti). */
function pearsonNaive(xs: number[], ys: number[]): number {
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const syy = ys.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const num = n * sxy - sx * sy;
  const den = Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy);
  return num / den;
}

describe("rollingCorrelation", () => {
  it("relazione lineare perfetta → 1; inversa → −1", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const pos = rollingCorrelation(xs, xs.map((v) => 3 * v + 2), 5);
    const neg = rollingCorrelation(xs, xs.map((v) => -2 * v + 1), 5);
    expect(pos[5]).toBeCloseTo(1, 10);
    expect(neg[5]).toBeCloseTo(-1, 10);
  });

  it("coincide con il Pearson naive (formula dei momenti) su dati qualunque", () => {
    const rnd = lcg(123);
    const n = 130;
    const xs = Array.from({ length: n }, () => rnd() - 0.5);
    // ys parzialmente correlate alle xs: il caso interessante
    const ys = xs.map((x) => 0.6 * x + 0.4 * (rnd() - 0.5));
    const w = 60;
    const rho = rollingCorrelation(xs, ys, w);
    for (let t = w - 1; t < n; t += 17) {
      const wx = xs.slice(t - w + 1, t + 1);
      const wy = ys.slice(t - w + 1, t + 1);
      expect(rho[t]).toBeCloseTo(pearsonNaive(wx, wy), 10);
    }
  });

  it("finestra incompleta → null; varianza nulla → null", () => {
    const flat = new Array(70).fill(1);
    const rnd = lcg(9);
    const xs = Array.from({ length: 70 }, () => rnd());
    const rho = rollingCorrelation(xs, flat, 60);
    expect(rho[58]).toBeNull(); // finestra non piena
    expect(rho[69]).toBeNull(); // driver costante: ρ non definita
  });

  it("serie di lunghezza diversa → errore esplicito", () => {
    expect(() => rollingCorrelation([1, 2], [1], 2)).toThrow(/lunghezza/);
  });
});

/* ───────────── Bande e confronto con la storia ───────────── */

describe("bandFromPercentile", () => {
  it("soglie del pannello COT: 10/30/70/90", () => {
    expect(bandFromPercentile(9.99)).toBe("MOLTO BASSO");
    expect(bandFromPercentile(10)).toBe("BASSO");
    expect(bandFromPercentile(30)).toBe("NELLA NORMA");
    expect(bandFromPercentile(69.99)).toBe("NELLA NORMA");
    expect(bandFromPercentile(70)).toBe("ALTO");
    expect(bandFromPercentile(90)).toBe("MOLTO ALTO");
  });
});

describe("currentVsHistory", () => {
  it("sotto MIN_SAMPLE osservazioni storiche: z e percentile null, dichiarati", () => {
    const series: (number | null)[] = Array.from(
      { length: MIN_SAMPLE }, // storia = MIN_SAMPLE − 1 < soglia
      (_, i) => i,
    );
    const cur = currentVsHistory(series);
    expect(cur).not.toBeNull();
    expect(cur?.z).toBeNull();
    expect(cur?.percentile).toBeNull();
    expect(cur?.n).toBe(MIN_SAMPLE - 1);
  });

  it("con storia sufficiente: percentile con < stretto sulla sola storia, z su tutta la serie (spec §3.1)", () => {
    // storia 0..299, corrente 150.5 → 151 valori sotto su 300 storici
    const series: (number | null)[] = [
      ...Array.from({ length: 300 }, (_, i) => i),
      150.5,
    ];
    const cur = currentVsHistory(series);
    expect(cur?.value).toBe(150.5);
    expect(cur?.percentile).toBeCloseTo((151 / 300) * 100, 10);
    // verifica indipendente dello z: μ e σ calcolati sui 301 valori
    const all = [...Array.from({ length: 300 }, (_, i) => i), 150.5];
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const sd = Math.sqrt(
      all.reduce((a, b) => a + (b - mean) ** 2, 0) / (all.length - 1),
    );
    expect(cur?.z).toBeCloseTo((150.5 - mean) / sd, 10);
  });

  it("i null in coda non contano: si giudica l'ultimo valore reale", () => {
    const series: (number | null)[] = [
      ...Array.from({ length: 300 }, (_, i) => i),
      42,
      null,
      null,
    ];
    expect(currentVsHistory(series)?.value).toBe(42);
  });

  it("serie tutta null → null", () => {
    expect(currentVsHistory([null, null])).toBeNull();
  });
});

/* ───── Indice cumulato standardizzato — grafico di forza relativa ───── */

describe("cumulativeStandardizedIndex", () => {
  it("parte da 0 e cumula le variazioni divise per σ — fatto a mano", () => {
    // σ=2: [4, −2, 6] → 0, 2, 1, 4
    expect(cumulativeStandardizedIndex([4, -2, 6], 2)).toEqual([0, 2, 1, 4]);
  });

  it("restituisce un valore in più delle variazioni (lo zero iniziale)", () => {
    const out = cumulativeStandardizedIndex([1, 1, 1, 1], 1);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(0);
  });

  it("NON sottrae la media: una serie tutta positiva sale, non resta piatta", () => {
    // se si togliesse la media (=1) il risultato sarebbe piatto a 0
    expect(cumulativeStandardizedIndex([1, 1, 1], 1)).toEqual([0, 1, 2, 3]);
  });

  it("serie con volatilità diverse diventano confrontabili", () => {
    // stessa dinamica, scale diverse: gli indici coincidono
    const piccola = cumulativeStandardizedIndex([0.01, 0.02], 0.01);
    const grande = cumulativeStandardizedIndex([10, 20], 10);
    expect(piccola).toEqual(grande);
  });

  it("σ non positiva → errore esplicito, mai una divisione per zero", () => {
    expect(() => cumulativeStandardizedIndex([1], 0)).toThrow(/σ/);
    expect(() => cumulativeStandardizedIndex([1], -1)).toThrow(/σ/);
  });
});

describe("windowStartIndex", () => {
  it("taglia agli ultimi 12 mesi di calendario", () => {
    const dates = ["2024-01-02", "2024-06-01", "2025-01-02", "2025-06-02"];
    // finestra a ritroso da 2025-06-02: parte da 2024-06-02 → primo utile
    const i = windowStartIndex(dates, CHART_WINDOW_DAYS);
    expect(dates[i]).toBe("2025-01-02");
  });

  it("storia più corta della finestra → parte dall'inizio", () => {
    const dates = ["2025-05-01", "2025-05-02", "2025-05-05"];
    expect(windowStartIndex(dates, CHART_WINDOW_DAYS)).toBe(0);
  });

  it("array vuoto → 0, nessun crash", () => {
    expect(windowStartIndex([], CHART_WINDOW_DAYS)).toBe(0);
  });
});
