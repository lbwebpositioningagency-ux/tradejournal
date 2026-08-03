import { describe, expect, it } from "vitest";
import {
  coverageGaps,
  hourlyLogReturns,
  precomputeIntraday,
  type HourBar,
} from "@/lib/seasonality/intraday";

const H = 3_600_000;

function bars(startIso: string, closes: (number | null)[]): HourBar[] {
  const t0 = new Date(startIso).getTime();
  const out: HourBar[] = [];
  closes.forEach((c, i) => {
    if (c !== null) out.push({ ts: new Date(t0 + i * H), close: c });
  });
  return out;
}

describe("hourlyLogReturns — tolleranza ai buchi", () => {
  it("produce un rendimento per ogni coppia di ore ADIACENTI", () => {
    const out = hourlyLogReturns(bars("2024-03-05T00:00:00Z", [100, 110, 121]));
    expect(out).toHaveLength(2);
    expect(out[0].r).toBeCloseTo(Math.log(1.1), 12);
    expect(out[1].r).toBeCloseTo(Math.log(1.1), 12);
  });

  it("NON produce rendimento a cavallo di un buco di un'ora", () => {
    // 00:00, 01:00, [buco], 03:00 → un solo rendimento, non due.
    const out = hourlyLogReturns(bars("2024-03-05T00:00:00Z", [100, 110, null, 200]));
    expect(out).toHaveLength(1);
    expect(out[0].r).toBeCloseTo(Math.log(1.1), 12);
  });

  it("NON attribuisce il salto del weekend alla riapertura della domenica", () => {
    // Chiusura venerdì 21:00 UTC, riapertura domenica 22:00 UTC: 49 ore dopo.
    const venerdi = new Date("2024-03-08T21:00:00Z");
    const domenica = new Date("2024-03-10T22:00:00Z");
    const out = hourlyLogReturns([
      { ts: venerdi, close: 100 },
      { ts: domenica, close: 130 },
      { ts: new Date(domenica.getTime() + H), close: 131 },
    ]);
    // Il gap di +30% non esiste come rendimento: resta solo l'ora adiacente.
    expect(out).toHaveLength(1);
    expect(out[0].r).toBeCloseTo(Math.log(131 / 130), 12);
  });

  it("NON attribuisce un mese mancante alla prima ora del mese dopo", () => {
    // È il caso reale del WTI: marzo 2024 assente dall'archivio Dukascopy.
    const feb = new Date("2024-02-29T23:00:00Z");
    const apr = new Date("2024-04-01T00:00:00Z");
    const out = hourlyLogReturns([
      { ts: feb, close: 78 },
      { ts: apr, close: 83 },
      { ts: new Date(apr.getTime() + H), close: 83.1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].r).toBeCloseTo(Math.log(83.1 / 83), 12);
  });

  it("scarta i prezzi non positivi", () => {
    const out = hourlyLogReturns([
      { ts: new Date("2024-03-05T00:00:00Z"), close: 0 },
      { ts: new Date("2024-03-05T01:00:00Z"), close: 100 },
      { ts: new Date("2024-03-05T02:00:00Z"), close: 110 },
    ]);
    expect(out).toHaveLength(1);
  });

  it("serie vuota o di una sola barra → nessun rendimento", () => {
    expect(hourlyLogReturns([])).toEqual([]);
    expect(hourlyLogReturns(bars("2024-03-05T00:00:00Z", [100]))).toEqual([]);
  });
});

describe("coverageGaps", () => {
  it("conta i salti di adiacenza", () => {
    const g = coverageGaps(bars("2024-03-05T00:00:00Z", [1, 2, null, 4, 5]));
    expect(g.present).toBe(4);
    expect(g.expected).toBe(5);
    expect(g.skipped).toBe(1);
  });

  it("copertura continua → nessun salto", () => {
    expect(coverageGaps(bars("2024-03-05T00:00:00Z", [1, 2, 3])).skipped).toBe(0);
  });
});

describe("precomputeIntraday", () => {
  /** Serie oraria continua su più anni, con un'ora "forte" configurabile. */
  function serie(
    fromYear: number,
    toYear: number,
    strongUtcHour: number | null,
  ): HourBar[] {
    const out: HourBar[] = [];
    let close = 100;
    const cur = new Date(Date.UTC(fromYear, 0, 1));
    const end = Date.UTC(toYear, 11, 31, 23);
    while (cur.getTime() <= end) {
      close *= cur.getUTCHours() === strongUtcHour ? 1.001 : 1;
      out.push({ ts: new Date(cur), close });
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
    return out;
  }

  const NOW = new Date("2026-08-03T00:00:00Z");

  it("produce 24 bucket orari per ciascuno dei due orologi", () => {
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2024, 2025, null),
      now: NOW,
    });
    for (const clock of ["UTC", "ROME"] as const) {
      const ore = out.stats.filter(
        (s) => s.granularity === "HOUR" && s.clock === clock && !s.detrended,
      );
      const buckets = new Set(ore.map((s) => s.bucket));
      expect(buckets.size).toBe(24);
    }
  });

  it("i due orologi NON sono la stessa tabella rietichettata", () => {
    // Un'ora forte in UTC si spalma su due ore italiane, perché fra CET e
    // CEST lo scarto cambia dentro l'anno: è il motivo per cui i bucket sono
    // precalcolati due volte invece di essere traslati.
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2024, 2025, 13),
      now: NOW,
    });
    const utc = out.stats.filter(
      (s) =>
        s.granularity === "HOUR" &&
        s.clock === "UTC" &&
        s.lookbackYears === 2 &&
        !s.detrended,
    );
    const rome = out.stats.filter(
      (s) =>
        s.granularity === "HOUR" &&
        s.clock === "ROME" &&
        s.lookbackYears === 2 &&
        !s.detrended,
    );
    // In UTC l'effetto sta tutto in un bucket…
    const forteUtc = utc.filter((s) => s.mean > 1e-9);
    expect(forteUtc).toHaveLength(1);
    expect(forteUtc[0].bucket).toBe(13);
    // …in ora italiana si divide fra le 14 (inverno) e le 15 (estate).
    const forteRome = rome.filter((s) => s.mean > 1e-9);
    expect(forteRome.map((s) => s.bucket).sort((a, b) => a - b)).toEqual([
      14, 15,
    ]);
  });

  it("Media/StDev/Pos%/n sono al livello della GRIGLIA: n = anni, non ore", () => {
    // Il difetto che questo test blocca: statistiche sul pool delle
    // osservazioni individuali (n≈17.000, StDev del singolo giorno, Pos%
    // da lancio di moneta) sotto una griglia che mostra medie PER ANNO.
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2020, 2025, 13),
      now: NOW,
    });
    const anniInGriglia = new Set(
      out.observations
        .filter((o) => o.granularity === "HOUR" && o.clock === "UTC")
        .map((o) => o.year),
    ).size;
    expect(anniInGriglia).toBe(6); // 2020-2025

    for (const s of out.stats.filter(
      (x) => x.granularity === "HOUR" && x.lookbackYears === 20,
    )) {
      // n è il numero di anni della griglia, mai il numero di ore.
      expect(s.n).toBe(anniInGriglia);
    }
    const sessioni = out.stats.filter(
      (x) => x.granularity === "SESSION" && x.lookbackYears === 20,
    );
    for (const s of sessioni) expect(s.n).toBe(anniInGriglia);

    // Serie deterministica: ogni anno identico → la dispersione FRA GLI
    // ANNI è ~0, non la dispersione oraria dentro l'anno.
    const forte = out.stats.find(
      (x) =>
        x.granularity === "HOUR" &&
        x.clock === "UTC" &&
        x.bucket === 13 &&
        x.lookbackYears === 20 &&
        !x.detrended,
    )!;
    expect(forte.stdev ?? 0).toBeLessThan(1e-6);
    expect(forte.positiveShare).toBe(1); // tutti gli anni positivi
  });

  it("produce le quattro sessioni, in una sola versione", () => {
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2024, 2025, null),
      now: NOW,
    });
    const sessioni = out.stats.filter((s) => s.granularity === "SESSION");
    expect(new Set(sessioni.map((s) => s.bucket))).toEqual(
      new Set([0, 1, 2, 3]),
    );
    expect(sessioni.every((s) => s.clock === "ROME")).toBe(true);
  });

  it("attribuisce l'ora forte alla sessione giusta", () => {
    // Sessioni sull'ora ITALIANA: le 14:00 UTC sono le 15 (inverno) o le 16
    // (estate) a Roma — in entrambi i casi dentro New York 14-22, bucket 2.
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2024, 2025, 14),
      now: NOW,
    });
    const sessioni = out.stats.filter(
      (s) =>
        s.granularity === "SESSION" && s.lookbackYears === 2 && !s.detrended,
    );
    const migliore = [...sessioni].sort((a, b) => b.mean - a.mean)[0];
    expect(migliore.bucket).toBe(2);
  });

  it("l'anno in corso resta fuori dalle finestre", () => {
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2024, 2026, null),
      now: NOW,
    });
    const riga = out.stats.find(
      (s) => s.granularity === "HOUR" && s.lookbackYears === 2,
    )!;
    expect(riga.lastDate.slice(0, 4)).toBe("2025");
  });

  it("dichiara gli anni completi disponibili, che limitano le finestre", () => {
    const out = precomputeIntraday({
      instrument: "GER40",
      bars: serie(2014, 2026, null),
      now: NOW,
    });
    // 2014-2025 = 12 anni solari completi: 20 e 15 anni non esistono.
    expect(out.completeYears).toBe(12);
  });

  it("produce le osservazioni per le heatmap, distinte per orologio", () => {
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: serie(2024, 2025, null),
      now: NOW,
    });
    const sessione = out.observations.filter(
      (o) => o.granularity === "SESSION",
    );
    const oreUtc = out.observations.filter(
      (o) => o.granularity === "HOUR" && o.clock === "UTC",
    );
    const oreRome = out.observations.filter(
      (o) => o.granularity === "HOUR" && o.clock === "ROME",
    );
    expect(sessione).toHaveLength(2 * 4); // 2 anni × 4 sessioni
    expect(oreUtc).toHaveLength(2 * 24);
    expect(oreRome).toHaveLength(2 * 24);
  });

  it("serie vuota → nessuna riga, nessun errore", () => {
    const out = precomputeIntraday({
      instrument: "XAUUSD",
      bars: [],
      now: NOW,
    });
    expect(out.stats).toEqual([]);
    expect(out.observations).toEqual([]);
    expect(out.completeYears).toBe(0);
  });
});
