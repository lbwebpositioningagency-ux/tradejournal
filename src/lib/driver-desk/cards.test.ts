import { describe, expect, it } from "vitest";
import type { DriverDeskSeries } from "@/generated/prisma/client";
import { DRIVER_CARDS } from "@/lib/driver-desk/catalog";
import type { SeriesObs } from "@/lib/driver-desk/engine";
import {
  MissingSeriesError,
  composeAllCards,
  composeCard,
  fmtIt,
  strengthPhrase,
} from "@/lib/driver-desk/cards";

/**
 * Dati sintetici DETERMINISTICI: sedute nei giorni feriali dal 2024-01-01,
 * livelli generati da un LCG. Abbastanza lunghi (420 sedute) da superare il
 * campione minimo (250) anche dopo le finestre a 60.
 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function weekdayDates(n: number, start = "2024-01-01"): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const N = 420;
const DATES = weekdayDates(N);

function priceSeries(seed: number, base: number): SeriesObs[] {
  const rnd = lcg(seed);
  let level = base;
  return DATES.map((date) => {
    level *= 1 + (rnd() - 0.5) / 60;
    return { date, value: level };
  });
}

function yieldSeries(seed: number, base: number): SeriesObs[] {
  const rnd = lcg(seed);
  let level = base;
  return DATES.map((date) => {
    level += (rnd() - 0.5) / 12; // può attraversare lo zero: è il punto
    return { date, value: level };
  });
}

function fullSeries(): Partial<Record<DriverDeskSeries, SeriesObs[]>> {
  return {
    XAUUSD: priceSeries(1, 2000),
    XAGUSD: priceSeries(2, 25),
    WTI: priceSeries(3, 80),
    BRENT: priceSeries(4, 84),
    GER40: priceSeries(5, 18000),
    STOXX50E: priceSeries(6, 4900),
    CAC40: priceSeries(7, 7800),
    SPX: priceSeries(8, 5000),
    DFII10: yieldSeries(9, 2),
    T10YIE: yieldSeries(10, 2.3),
    DTWEXBGS: priceSeries(11, 120),
    EURUSD: priceSeries(12, 1.08),
    BUND10Y: yieldSeries(13, 2.5),
  };
}

const ORO = DRIVER_CARDS.find((c) => c.id === "ORO")!;
const WTI_CARD = DRIVER_CARDS.find((c) => c.id === "WTI")!;

describe("composeCard — scheda oro completa", () => {
  const payload = composeCard(ORO, fullSeries());

  it("il rame resta dichiarato assente (D1), mai un surrogato", () => {
    expect(payload.missing.some((m) => m.label === "Rame")).toBe(true);
  });

  it("Blocco A: entrambe le finestre (20 e 60), con banda e frase in linguaggio piano", () => {
    expect(payload.strength).not.toBeNull();
    expect(payload.strength!.map((s) => s.window)).toEqual([20, 60]);
    for (const s of payload.strength!) {
      expect(s.percentile).not.toBeNull();
      expect(s.band).not.toBeNull();
      expect(s.sentence).toMatch(/sedute dal 2024/);
      // mai gergo statistico nella frase
      expect(s.sentence).not.toMatch(/percentile|z-score/i);
    }
  });

  it("Blocco B: un contesto per driver, mai sommati (3 driver = 3 voci)", () => {
    expect(payload.drivers).toHaveLength(3);
    for (const d of payload.drivers) {
      expect(d.sentence).toMatch(/sedute dal 2024/);
    }
  });

  it("Blocco C: una relazione per driver, con segno OSSERVATO dichiarato", () => {
    expect(payload.relations).toHaveLength(3);
    for (const r of payload.relations) {
      expect(r.signSentence).toMatch(/correlazione osservata/);
      expect(Math.abs(r.rho)).toBeLessThanOrEqual(1);
    }
  });

  it("il calendario dichiara inizio, fine e numerosità", () => {
    expect(payload.calendar.sessions).toBe(N);
    expect(payload.calendar.start).toBe(DATES[0]);
    expect(payload.calendar.end).toBe(DATES[N - 1]);
  });

  it("VERIFICA INDIPENDENTE Blocco A: RS a 20 sedute ricostruita a parte", () => {
    const series = fullSeries();
    const gold = series.XAUUSD!.map((o) => o.value);
    const silver = series.XAGUSD!.map((o) => o.value);
    // le serie sintetiche condividono già le stesse date: il calendario
    // comune coincide, quindi la ricostruzione può lavorare sui grezzi
    const logret = (xs: number[]) =>
      xs.slice(1).map((v, i) => Math.log(v / xs[i]));
    const rg = logret(gold);
    const rs = logret(silver);
    const w = 20;
    let cumG = 0;
    let cumS = 0;
    for (let i = rg.length - w; i < rg.length; i += 1) {
      cumG += rg[i];
      cumS += rs[i];
    }
    const expected = cumG - cumS;
    const got = payload.strength!.find((s) => s.window === 20)!.value;
    expect(got).toBeCloseTo(expected, 10);
  });

  it("VERIFICA INDIPENDENTE Blocco B: livello e Δ20 del rendimento reale", () => {
    const series = fullSeries();
    const dfii = series.DFII10!.map((o) => o.value);
    const driver = payload.drivers.find((d) =>
      d.label.includes("reale"),
    )!;
    expect(driver.level).toBeCloseTo(dfii[dfii.length - 1], 10);
    // Δ20 in punti: L_t − L_{t−20}
    expect(driver.delta).toBeCloseTo(
      dfii[dfii.length - 1] - dfii[dfii.length - 1 - 20],
      10,
    );
  });

  it("VERIFICA INDIPENDENTE Blocco C: ρ60 oro↔dollaro ricostruita con Pearson naive", () => {
    const series = fullSeries();
    const gold = series.XAUUSD!.map((o) => o.value);
    const dxy = series.DTWEXBGS!.map((o) => o.value);
    const logret = (xs: number[]) =>
      xs.slice(1).map((v, i) => Math.log(v / xs[i]));
    const rg = logret(gold).slice(-60);
    const rd = logret(dxy).slice(-60);
    const n = 60;
    const sx = rg.reduce((a, b) => a + b, 0);
    const sy = rd.reduce((a, b) => a + b, 0);
    const sxx = rg.reduce((a, b) => a + b * b, 0);
    const syy = rd.reduce((a, b) => a + b * b, 0);
    const sxy = rg.reduce((a, b, i) => a + b * rd[i], 0);
    const expected =
      (n * sxy - sx * sy) /
      (Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy));
    const rel = payload.relations.find((r) => r.label.includes("Dollar"))!;
    expect(rel.rho).toBeCloseTo(expected, 10);
  });
});

describe("composeCard — degradazioni dichiarate", () => {
  it("D4: senza Brent la scheda WTI perde il paniere ma tiene B e C", () => {
    const series = fullSeries();
    delete series.BRENT;
    const payload = composeCard(WTI_CARD, series);
    expect(payload.strength).toBeNull();
    expect(payload.strengthUnavailable).toMatch(/paniere/);
    // Brent assente E spread decaduto: entrambi dichiarati
    expect(payload.missing.some((m) => m.label === "Brent")).toBe(true);
    expect(payload.missing.some((m) => m.label.includes("Spread"))).toBe(true);
    // resta il solo dollar index in B e C
    expect(payload.drivers).toHaveLength(1);
    expect(payload.relations).toHaveLength(1);
  });

  it("VERIFICA INDIPENDENTE spread: livello = WTI − Brent dell'ultima seduta comune", () => {
    const series = fullSeries();
    const payload = composeCard(WTI_CARD, series);
    const wti = series.WTI!.map((o) => o.value);
    const brent = series.BRENT!.map((o) => o.value);
    const spread = payload.drivers.find((d) => d.label.includes("Spread"))!;
    expect(spread.level).toBeCloseTo(
      wti[wti.length - 1] - brent[brent.length - 1],
      10,
    );
  });

  it("serie principale assente → errore esplicito, mai una scheda vuota muta", () => {
    const series = fullSeries();
    delete series.XAUUSD;
    expect(() => composeCard(ORO, series)).toThrow(MissingSeriesError);
  });

  it("composeAllCards raccoglie gli errori senza spegnere le altre schede", () => {
    const series = fullSeries();
    delete series.GER40;
    const { cards, errors } = composeAllCards(series);
    expect(cards.map((c) => c.id)).toEqual(["ORO", "WTI"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe("DAX");
  });

  it("storia corta: statistiche dichiarate insufficienti, mai numeri inventati", () => {
    const series = fullSeries();
    const short = 80; // sotto MIN_SAMPLE + finestre
    for (const key of Object.keys(series) as DriverDeskSeries[]) {
      series[key] = series[key]!.slice(-short);
    }
    const payload = composeCard(ORO, series);
    for (const s of payload.strength ?? []) {
      expect(s.percentile).toBeNull();
      expect(s.sentence).toMatch(/insufficiente/);
    }
  });
});

describe("linguaggio piano", () => {
  it("strengthPhrase rovescia la frase sotto il 50%", () => {
    expect(strengthPhrase(62, "2018")).toBe(
      "più forte che nel 62% delle sedute dal 2018",
    );
    expect(strengthPhrase(22, "2018")).toBe(
      "più debole che nel 78% delle sedute dal 2018",
    );
  });

  it("fmtIt: virgola decimale e segno meno tipografico", () => {
    expect(fmtIt(-0.42, 2)).toBe("−0,42");
    expect(fmtIt(1.5, 1)).toBe("1,5");
  });
});
