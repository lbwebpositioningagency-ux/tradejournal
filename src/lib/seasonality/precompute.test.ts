import { describe, expect, it } from "vitest";
import { precomputeDaily, windowYears } from "@/lib/seasonality/precompute";
import type { DailyBar } from "@/lib/seasonality/series";
import { isoWeek } from "@/lib/seasonality/buckets";

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
    const mensili = out.observations.filter((o) => o.granularity === "MONTH");
    expect(mensili.some((m) => m.year === 2026)).toBe(true);
    const gen2025 = mensili.find((m) => m.year === 2025 && m.bucket === 1)!;
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

  it("il percorso stagionale ha 366 punti (0-365) e numerosità, senza quartili", () => {
    const bars = dailySeries(2010, 2026, (d) => (d.getUTCMonth() === 2 ? 1.002 : 1.0001));
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const punti = out.paths.filter(
      (p) => p.lookbackYears === 10 && !p.detrended,
    );
    expect(punti.map((p) => p.dayOfYear)).toEqual(
      Array.from({ length: 366 }, (_, i) => i),
    );
    expect(punti[0].meanCum).toBe(0);
    for (const p of punti) {
      // Le colonne della banda tolta ripetono la media: nessun quartile calcolato.
      expect(p.p25Cum).toBe(p.meanCum);
      expect(p.p75Cum).toBe(p.meanCum);
      expect(p.n).toBe(10);
    }
  });

  it("una finestra con anni incompleti non ha percorso: si omette, non si approssima", () => {
    // La storia parte a giugno 2016: 2016 non è completo, 10 anni (2016-2025) non ci stanno.
    const bars = dailySeries(2016, 2026, () => 1.0002).filter(
      (b) => b.date >= "2016-06-03",
    );
    const out = precomputeDaily({ instrument: "GVZ", kind: "LEVEL", bars, now: NOW });
    expect(out.paths.some((p) => p.lookbackYears === 10)).toBe(false);
    expect(out.paths.some((p) => p.lookbackYears === 5)).toBe(true);
    // Le statistiche per bucket restano: la tabella dichiara il campione.
    expect(out.stats.some((s) => s.lookbackYears === 10)).toBe(true);
  });

  it("le barre di domenica si fondono nel lunedì: il lunedì prende il rendimento dal venerdì", () => {
    const bars: DailyBar[] = [];
    let close = 100;
    const cur = new Date(Date.UTC(2020, 0, 1));
    while (cur.getTime() <= Date.UTC(2026, 6, 31)) {
      const dow = cur.getUTCDay();
      const date = cur.toISOString().slice(0, 10);
      if (dow === 0) {
        // domenica: la sessione serale sale del 2%, il lunedì la restituisce tutta e poco più
        bars.push({ date, close: close * 1.02 });
      } else if (dow === 1) {
        close *= 1.001;
        bars.push({ date, close });
      } else if (dow !== 6) {
        bars.push({ date, close });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    const out = precomputeDaily({ instrument: "XAUUSD", kind: "RETURN", bars, now: NOW });
    const lunedi = out.stats.find(
      (s) =>
        s.granularity === "WEEKDAY" &&
        s.scope === "ALL" &&
        s.lookbackYears === 5 &&
        s.bucket === 1 &&
        !s.detrended,
    )!;
    // Venerdì→lunedì = +0,1%. Domenica→lunedì sarebbe stato −1,9%.
    expect(lunedi.mean).toBeCloseTo(Math.log(1.001), 10);
  });

  it("ampiezza massimo-minimo solo dove esistono massimo e minimo, niente MAE/MFE", () => {
    const conOhlc = dailySeries(2014, 2026, () => 1.0003).map((b) => ({
      ...b,
      open: b.close,
      high: b.close * 1.01,
      low: b.close * 0.99,
    }));
    const out = precomputeDaily({ instrument: "SPX", kind: "RETURN", bars: conOhlc, now: NOW });
    const marzo = out.stats.find(
      (s) => s.granularity === "MONTH" && s.scope === "AMPIEZZA" && s.lookbackYears === 10 && s.bucket === 3,
    )!;
    expect(marzo.n).toBe(10);
    // Un mese che sale dello 0,03% al giorno ha un range più largo di una seduta.
    expect(marzo.mean).toBeGreaterThan(0.02);
    const martedi = out.stats.find(
      (s) => s.granularity === "WEEKDAY" && s.scope === "AMPIEZZA" && s.lookbackYears === 10 && s.bucket === 2,
    )!;
    // (1,01 − 0,99) · chiusura / apertura = 2% esatto per ogni seduta.
    expect(martedi.mean).toBeCloseTo(0.02, 12);
    // Media sulle OCCORRENZE: n conta i martedì, non gli anni.
    expect(martedi.n).toBeGreaterThan(500);
    expect(out.stats.some((s) => s.scope === "AMPIEZZA:M09" && s.granularity === "WEEKDAY")).toBe(true);
    expect(out.stats.some((s) => s.scope.startsWith("MAE") || s.scope.startsWith("MFE"))).toBe(false);

    // Solo chiusure (il WTI spot): nessuna riga di ampiezza.
    const soloChiusure = precomputeDaily({
      instrument: "WTI",
      kind: "RETURN",
      bars: dailySeries(2014, 2026, () => 1.0003),
      now: NOW,
    });
    expect(soloChiusure.stats.some((s) => s.scope.startsWith("AMPIEZZA"))).toBe(false);
  });

  it("il percorso detrendizzato finisce vicino allo zero (tolta la pendenza)", () => {
    const bars = dailySeries(2010, 2026, () => 1.0004);
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
    expect(out.observations).toEqual([]);
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

  it("il percorso è l'indice delle VARIAZIONI log, non la media dei livelli", () => {
    const out = precomputeDaily({
      instrument: "VIX",
      kind: "LEVEL",
      bars: livelli(),
      now: NOW,
    });
    const punto = (giorno: number) =>
      out.paths.find((p) => p.lookbackYears === 10 && p.dayOfYear === giorno)!;
    // 20 ottobre (giorno 293): il livello è raddoppiato da settembre → log 2.
    expect(punto(293).meanCum).toBeCloseTo(Math.log(2), 10);
    // Fine anno: di nuovo a 15, come l'anno prima → la forma torna alla partenza.
    expect(punto(365).meanCum).toBeCloseTo(0, 10);
    // Nessuna ampiezza su un livello di volatilità.
    expect(out.stats.some((s) => s.scope !== "ALL" && !s.scope.startsWith("M0") && !s.scope.startsWith("M1"))).toBe(false);
  });
});

/** Serie giornaliera sintetica lun-ven, con fattore controllabile per data. */
function dailySeries(
  fromYear: number,
  toYear: number,
  factorFor: (d: Date) => number,
): DailyBar[] {
  const bars: DailyBar[] = [];
  let close = 100;
  const cur = new Date(Date.UTC(fromYear, 0, 1));
  const end = Date.UTC(toYear, 11, 31);
  while (cur.getTime() <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      close *= factorFor(cur);
      bars.push({ date: cur.toISOString().slice(0, 10), close });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return bars;
}

describe("precomputeDaily — settimana ISO", () => {
  it("produce 53 bucket settimanali, con la 53 più rara", () => {
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars: dailySeries(2000, 2026, () => 1.001),
      now: NOW,
    });
    const settimane = out.stats.filter(
      (s) => s.granularity === "WEEK" && s.lookbackYears === 20 && !s.detrended,
    );
    const buckets = settimane.map((s) => s.bucket).sort((a, b) => a - b);
    expect(buckets[0]).toBe(1);
    expect(buckets[buckets.length - 1]).toBe(53);

    const s52 = settimane.find((s) => s.bucket === 52)!;
    const s53 = settimane.find((s) => s.bucket === 53)!;
    // La 53 esiste solo in alcuni anni: campione più piccolo, non assente.
    expect(s52.n).toBe(20);
    expect(s53.n).toBeGreaterThan(0);
    expect(s53.n).toBeLessThan(s52.n);
  });

  it("riconosce una settimana stagionalmente forte", () => {
    // Tutta la settimana ISO 10 spinta, il resto piatto.
    const bars = dailySeries(2006, 2026, (d) => {
      const week = isoWeek(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
      );
      return week === 10 ? 1.01 : 1.0;
    });
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const forte = out.stats.find(
      (s) =>
        s.granularity === "WEEK" &&
        s.lookbackYears === 20 &&
        s.bucket === 10 &&
        !s.detrended,
    )!;
    const piatta = out.stats.find(
      (s) =>
        s.granularity === "WEEK" &&
        s.lookbackYears === 20 &&
        s.bucket === 25 &&
        !s.detrended,
    )!;
    expect(forte.mean).toBeGreaterThan(0.03);
    expect(forte.positiveShare).toBe(1);
    expect(piatta.mean).toBeCloseTo(0, 10);
  });

  it("le finestre valgono anche per la settimana: n = anni della finestra", () => {
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars: dailySeries(2000, 2026, () => 1.001),
      now: NOW,
    });
    for (const lookback of [20, 10, 5, 2]) {
      const row = out.stats.find(
        (s) =>
          s.granularity === "WEEK" &&
          s.lookbackYears === lookback &&
          s.bucket === 20 &&
          !s.detrended,
      )!;
      expect(row.n).toBe(lookback);
    }
  });

  it("il detrend settimanale porta le medie a somma zero", () => {
    const bars = dailySeries(2006, 2026, (d) => {
      const week = isoWeek(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
      );
      return week === 10 ? 1.01 : 1.001;
    });
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars,
      now: NOW,
    });
    const detrendizzate = out.stats.filter(
      (s) => s.granularity === "WEEK" && s.lookbackYears === 20 && s.detrended,
    );
    const somma = detrendizzate.reduce((a, s) => a + s.mean * s.n, 0);
    expect(somma).toBeCloseTo(0, 6);
  });

  it("gli indici di volatilità hanno la settimana come LIVELLO e senza detrend", () => {
    const bars = dailySeries(2010, 2026, () => 1).map((b) => ({
      ...b,
      close: 20,
    }));
    const out = precomputeDaily({
      instrument: "VIX",
      kind: "LEVEL",
      bars,
      now: NOW,
    });
    const week = out.stats.filter((s) => s.granularity === "WEEK");
    expect(week.length).toBeGreaterThan(0);
    expect(week.every((s) => !s.detrended)).toBe(true);
    expect(week[0].mean).toBeCloseTo(20, 8);
  });
});

describe("precomputeDaily — osservazioni per le heatmap", () => {
  it("copre le tre granularità del calendario", () => {
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars: dailySeries(2020, 2026, () => 1.001),
      now: NOW,
    });
    const gran = new Set(out.observations.map((o) => o.granularity));
    expect([...gran].sort()).toEqual(["MONTH", "WEEK", "WEEKDAY"]);
  });

  it("la casella per giorno della settimana è la MEDIA dell'anno, con days", () => {
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars: dailySeries(2024, 2024, () => 1.001),
      now: NOW,
    });
    const lunedi2024 = out.observations.find(
      (o) => o.granularity === "WEEKDAY" && o.year === 2024 && o.bucket === 1,
    )!;
    expect(lunedi2024.value).toBeCloseTo(Math.log(1.001), 10);
    // ~52 lunedì nell'anno (il primo giorno non ha rendimento).
    expect(lunedi2024.days).toBeGreaterThan(45);
    expect(lunedi2024.days).toBeLessThan(54);
  });

  it("le caselle per giorno esistono solo per lunedì-venerdì", () => {
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars: dailySeries(2020, 2026, () => 1.001),
      now: NOW,
    });
    const buckets = new Set(
      out.observations
        .filter((o) => o.granularity === "WEEKDAY")
        .map((o) => o.bucket),
    );
    expect([...buckets].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("le settimane sono indicizzate sull'anno ISO", () => {
    const out = precomputeDaily({
      instrument: "SPX",
      kind: "RETURN",
      bars: dailySeries(2019, 2021, () => 1.001),
      now: NOW,
    });
    // La settimana 1 del 2020 comincia il 30 dicembre 2019: deve stare
    // sull'anno ISO 2020, non sul 2019.
    const s1 = out.observations.find(
      (o) => o.granularity === "WEEK" && o.year === 2020 && o.bucket === 1,
    );
    expect(s1).toBeDefined();
  });
});

describe("campione grezzo e livello di aggregazione", () => {
  /** Serie giornaliera vera (lun-ven), per contare giorni e non mesi. */
  function dailySeries(fromYear: number, toYear: number): DailyBar[] {
    const bars: DailyBar[] = [];
    let close = 100;
    const cur = new Date(Date.UTC(fromYear, 0, 1));
    const end = Date.UTC(toYear, 11, 31);
    while (cur.getTime() <= end) {
      const dow = cur.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        close *= 1.001;
        bars.push({ date: cur.toISOString().slice(0, 10), close });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return bars;
  }

  it("il GIORNO della settimana ha n = anni, non n = giorni", () => {
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars: dailySeries(2015, 2026),
      now: NOW,
    });
    const lun = out.stats.find(
      (s) =>
        s.granularity === "WEEKDAY" &&
        s.scope === "ALL" &&
        s.lookbackYears === 10 &&
        s.bucket === 1 &&
        !s.detrended,
    );
    // n è il numero di ANNI della finestra: la stessa unità della griglia
    // sopra la tabella, dove «lunedì 2024» è UNA casella.
    expect(lun?.n).toBe(10);
    // il campione grezzo sono i lunedì veri: ~52 l'anno per dieci anni
    expect(lun?.rawCount).toBeGreaterThan(500);
    expect(lun?.rawCount).toBeLessThan(530);
  });

  it("il campione del MESE conta i MESI: venti gennai, non i loro giorni", () => {
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars: dailySeries(2015, 2026),
      now: NOW,
    });
    const set = out.stats.find(
      (s) =>
        s.granularity === "MONTH" &&
        s.lookbackYears === 10 &&
        s.bucket === 9 &&
        !s.detrended,
    );
    expect(set?.n).toBe(10);
    // dieci settembre = dieci occorrenze: l'unità del campione è il bucket
    expect(set?.rawCount).toBe(10);
  });

  it("il campione della SETTIMANA conta le SETTIMANE, non i giorni", () => {
    const out = precomputeDaily({
      instrument: "XAUUSD",
      kind: "RETURN",
      bars: dailySeries(2015, 2026),
      now: NOW,
    });
    const w10 = out.stats.find(
      (s) =>
        s.granularity === "WEEK" &&
        s.lookbackYears === 10 &&
        s.bucket === 10 &&
        !s.detrended,
    );
    expect(w10?.n).toBe(10);
    expect(w10?.rawCount).toBe(10);
  });

  it("«in rialzo» del GIORNO conta i lunedì saliti, non gli anni col lunedì medio positivo", () => {
    // Il primo lunedì di ogni mese +3%, gli altri −0,5%: il lunedì MEDIO di
    // ogni anno è positivo (12 · 3 − 40 · 0,5 > 0), ma i lunedì saliti sono
    // solo dodici l'anno. Il calcolo precedente diceva «10 anni su 10».
    const bars: DailyBar[] = [];
    let close = 100;
    const cur = new Date(Date.UTC(2015, 0, 1));
    while (cur.getTime() <= Date.UTC(2026, 6, 31)) {
      const dow = cur.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        if (dow === 1) close *= cur.getUTCDate() <= 7 ? 1.03 : 0.995;
        bars.push({ date: cur.toISOString().slice(0, 10), close });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    const out = precomputeDaily({ instrument: "XAUUSD", kind: "RETURN", bars, now: NOW });
    const lun = out.stats.find(
      (s) => s.granularity === "WEEKDAY" && s.scope === "ALL" && s.lookbackYears === 10 && s.bucket === 1 && !s.detrended,
    )!;
    expect(lun.n).toBe(10);
    expect(lun.mean).toBeGreaterThan(0);
    // 2016-2025: esattamente un lunedì fra l'1 e il 7 di ogni mese.
    expect(Math.round(lun.positiveShare * lun.rawCount)).toBe(120);
    expect(lun.positiveShare).toBeLessThan(0.3);

    // Il mese resta contato in mesi: unità e occorrenza coincidono.
    const gen = out.stats.find(
      (s) => s.granularity === "MONTH" && s.scope === "ALL" && s.lookbackYears === 10 && s.bucket === 1 && !s.detrended,
    )!;
    expect(gen.rawCount).toBe(10);
    expect(Number.isInteger(gen.positiveShare * gen.rawCount)).toBe(true);
  });
});
