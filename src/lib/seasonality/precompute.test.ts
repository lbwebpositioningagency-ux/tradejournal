import { describe, expect, it } from "vitest";
import { precomputeDaily, windowYears } from "@/lib/seasonality/precompute";
import type { DailyBar } from "@/lib/seasonality/series";

/** Serie sintetica: una barra al mese, prezzo che cresce di un fattore noto. */
function monthlySeries(
  fromYear: number,
  toYear: number,
  factorFor: (year: number, month: number) => number,
): DailyBar[] {
  const bars: DailyBar[] = [];
  let close = 100;
  for (let y = fromYear; y <= toYear; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      close *= factorFor(y, m);
      // ultimo giorno "sicuro" del mese: 28 esiste ovunque
      bars.push({ date: `${y}-${String(m).padStart(2, "0")}-28`, close });
    }
  }
  return bars;
}

const NOW = new Date("2026-08-03T00:00:00Z");

describe("windowYears", () => {
  it("una finestra di N anni copre gli ultimi N anni SOLARI COMPLETI", () => {
    expect(windowYears(20, 2025)).toEqual({ from: 2006, to: 2025 });
    expect(windowYears(2, 2025)).toEqual({ from: 2024, to: 2025 });
  });
});

describe("precomputeDaily — prezzi", () => {
  it("l'anno in corso è ESCLUSO dalle statistiche", () => {
    const bars = monthlySeries(2020, 2026, () => 1.01);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    expect(out.lastCompleteYear).toBe(2025);
    const gennaio5 = out.stats.find(
      (s) =>
        s.granularity === "MONTH" &&
        s.lookbackYears === 5 &&
        s.bucket === 1 &&
        !s.detrended,
    )!;
    // 2021-2025: cinque gennai, non sei — il 2026 non c'è.
    expect(gennaio5.n).toBe(5);
    expect(gennaio5.lastDate.slice(0, 4)).toBe("2025");
  });

  it("n per un bucket mensile è esattamente la lunghezza della finestra", () => {
    const bars = monthlySeries(2000, 2026, () => 1.005);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    for (const lookback of [20, 15, 10, 5, 2]) {
      const row = out.stats.find(
        (s) =>
          s.granularity === "MONTH" &&
          s.lookbackYears === lookback &&
          s.bucket === 6 &&
          !s.detrended,
      )!;
      expect(row.n).toBe(lookback);
    }
  });

  it("riconosce un mese stagionalmente forte", () => {
    // Settembre +5%, tutti gli altri mesi piatti.
    const bars = monthlySeries(2005, 2026, (_, m) => (m === 9 ? 1.05 : 1.0));
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const settembre = out.stats.find(
      (s) =>
        s.granularity === "MONTH" &&
        s.lookbackYears === 20 &&
        s.bucket === 9 &&
        !s.detrended,
    )!;
    const marzo = out.stats.find(
      (s) =>
        s.granularity === "MONTH" &&
        s.lookbackYears === 20 &&
        s.bucket === 3 &&
        !s.detrended,
    )!;
    expect(settembre.mean).toBeCloseTo(Math.log(1.05), 10);
    expect(settembre.positiveShare).toBe(1);
    expect(settembre.stdev).toBeCloseTo(0, 10);
    expect(marzo.mean).toBeCloseTo(0, 10);
    expect(marzo.positiveShare).toBe(0); // zero non è positivo
  });

  it("il detrend sposta le medie mensili a somma zero", () => {
    const bars = monthlySeries(2005, 2026, (_, m) => (m === 9 ? 1.05 : 1.01));
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const detrendizzati = out.stats.filter(
      (s) =>
        s.granularity === "MONTH" && s.lookbackYears === 20 && s.detrended,
    );
    expect(detrendizzati).toHaveLength(12);
    const somma = detrendizzati.reduce((a, s) => a + s.mean, 0);
    expect(somma).toBeCloseTo(0, 8);

    // Grezzo: tutti i mesi positivi (la marea). Detrend: solo settembre.
    const grezzi = out.stats.filter(
      (s) =>
        s.granularity === "MONTH" && s.lookbackYears === 20 && !s.detrended,
    );
    expect(grezzi.every((s) => s.mean > 0)).toBe(true);
    expect(detrendizzati.filter((s) => s.mean > 0)).toHaveLength(1);
    expect(detrendizzati.find((s) => s.mean > 0)!.bucket).toBe(9);
  });

  it("produce un'osservazione mensile per la heatmap, anno in corso incluso", () => {
    const bars = monthlySeries(2024, 2026, () => 1.02);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    // La heatmap mostra anche il 2026 parziale: è escluso dalle medie, non
    // dalla griglia.
    expect(out.monthly.some((m) => m.year === 2026)).toBe(true);
    const gen2025 = out.monthly.find((m) => m.year === 2025 && m.month === 1)!;
    expect(gen2025.value).toBeCloseTo(Math.log(1.02), 10);
  });

  it("i bucket per giorno della settimana sono solo lunedì-venerdì", () => {
    const bars: DailyBar[] = [];
    let close = 100;
    for (let d = 1; d <= 28; d += 1) {
      close *= 1.001;
      bars.push({ date: `2025-01-${String(d).padStart(2, "0")}`, close });
    }
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const weekdays = out.stats
      .filter((s) => s.granularity === "WEEKDAY" && s.scope === "ALL")
      .map((s) => s.bucket);
    expect([...new Set(weekdays)].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("il drill per giorno dentro un mese esiste con scope M09", () => {
    const bars = monthlySeries(2015, 2026, () => 1.01);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const settembre = out.stats.filter(
      (s) => s.granularity === "WEEKDAY" && s.scope === "M09",
    );
    expect(settembre.length).toBeGreaterThan(0);
    expect(settembre.every((s) => s.firstDate.slice(5, 7) === "09")).toBe(true);
  });

  it("il percorso stagionale ha bande e numerosità", () => {
    const bars = monthlySeries(2010, 2026, () => 1.01);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const punti = out.paths.filter(
      (p) => p.lookbackYears === 10 && !p.detrended,
    );
    expect(punti.length).toBeGreaterThan(300);
    for (const p of punti) {
      expect(p.p25Cum).toBeLessThanOrEqual(p.medianCum + 1e-12);
      expect(p.p75Cum).toBeGreaterThanOrEqual(p.medianCum - 1e-12);
      expect(p.n).toBeGreaterThan(0);
      expect(p.n).toBeLessThanOrEqual(10);
    }
  });

  it("il percorso detrendizzato finisce vicino allo zero (tolta la pendenza)", () => {
    const bars = monthlySeries(2010, 2026, () => 1.01);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const fineGrezzo = out.paths.find(
      (p) => p.lookbackYears === 10 && !p.detrended && p.dayOfYear === 365,
    )!;
    const fineDetrend = out.paths.find(
      (p) => p.lookbackYears === 10 && p.detrended && p.dayOfYear === 365,
    )!;
    expect(fineGrezzo.meanCum).toBeGreaterThan(0.05);
    expect(Math.abs(fineDetrend.meanCum)).toBeLessThan(0.01);
  });

  it("serie vuota → nessuna riga, nessun errore", () => {
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars: [],
      now: NOW,
    });
    expect(out.stats).toEqual([]);
    expect(out.paths).toEqual([]);
    expect(out.monthly).toEqual([]);
    expect(out.firstDate).toBeNull();
  });

  it("storia più corta della finestra: meno osservazioni, non un errore", () => {
    const bars = monthlySeries(2023, 2026, () => 1.01);
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const venti = out.stats.find(
      (s) =>
        s.granularity === "MONTH" &&
        s.lookbackYears === 20 &&
        s.bucket === 5 &&
        !s.detrended,
    )!;
    // Chiesti 20 anni, disponibili 2024 e 2025: n = 3 (2023 incluso).
    expect(venti.n).toBe(3);
    expect(venti.firstDate.slice(0, 4)).toBe("2023");
  });
});

describe("precomputeDaily — indici di volatilità", () => {
  const livelli = (): DailyBar[] => {
    const bars: DailyBar[] = [];
    for (let y = 2010; y <= 2026; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        // Ottobre alto (30), resto basso (15): stagionalità di LIVELLO.
        const level = m === 10 ? 30 : 15;
        for (const d of [10, 20]) {
          bars.push({
            date: `${y}-${String(m).padStart(2, "0")}-${d}`,
            close: level,
          });
        }
      }
    }
    return bars;
  };

  it("misura il LIVELLO medio, non un rendimento", () => {
    const out = precomputeDaily({
      instrument: "VIX",
      kind: "LEVEL",
      bars: livelli(),
      now: NOW,
    });
    const ottobre = out.stats.find(
      (s) =>
        s.granularity === "MONTH" && s.lookbackYears === 10 && s.bucket === 10,
    )!;
    const aprile = out.stats.find(
      (s) =>
        s.granularity === "MONTH" && s.lookbackYears === 10 && s.bucket === 4,
    )!;
    expect(ottobre.mean).toBeCloseTo(30, 10);
    expect(aprile.mean).toBeCloseTo(15, 10);
  });

  it("Pos% è la quota SOPRA LA MEDIANA della finestra, non un hit rate", () => {
    const out = precomputeDaily({
      instrument: "VIX",
      kind: "LEVEL",
      bars: livelli(),
      now: NOW,
    });
    const ottobre = out.stats.find(
      (s) =>
        s.granularity === "MONTH" && s.lookbackYears === 10 && s.bucket === 10,
    )!;
    const aprile = out.stats.find(
      (s) =>
        s.granularity === "MONTH" && s.lookbackYears === 10 && s.bucket === 4,
    )!;
    expect(ottobre.positiveShare).toBe(1); // sempre sopra la mediana
    expect(aprile.positiveShare).toBe(0); // mai sopra
  });

  it("NON esiste la variante detrendizzata (nessun drift da togliere)", () => {
    const out = precomputeDaily({
      instrument: "VIX",
      kind: "LEVEL",
      bars: livelli(),
      now: NOW,
    });
    expect(out.stats.some((s) => s.detrended)).toBe(false);
    expect(out.paths.some((p) => p.detrended)).toBe(false);
  });

  it("il percorso riporta il livello e non lo cumula", () => {
    const out = precomputeDaily({
      instrument: "VIX",
      kind: "LEVEL",
      bars: livelli(),
      now: NOW,
    });
    const fine = out.paths.find(
      (p) => p.lookbackYears === 10 && p.dayOfYear === 365,
    )!;
    // Un cumulato esploderebbe; un livello resta un livello.
    expect(fine.meanCum).toBeGreaterThan(10);
    expect(fine.meanCum).toBeLessThan(35);
  });
});
