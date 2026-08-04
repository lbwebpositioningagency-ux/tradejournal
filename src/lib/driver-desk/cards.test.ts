import { describe, expect, it } from "vitest";
import type { DriverDeskSeries } from "@/generated/prisma/client";
import { DRIVER_CARDS } from "@/lib/driver-desk/catalog";
import type { SeriesObs } from "@/lib/driver-desk/engine";
import { CHART_WINDOW_DAYS } from "@/lib/driver-desk/engine";
import {
  MissingSeriesError,
  composeAllCards,
  composeCard,
  fmtIt,
  strengthPhrase,
} from "@/lib/driver-desk/cards";

/**
 * Dati sintetici DETERMINISTICI: sedute nei giorni feriali dal 2024-01-01,
 * livelli generati da un LCG. Abbastanza lunghi (600 sedute ≈ 2,3 anni) da
 * avere sia una finestra grafico piena di 12 mesi sia una storia precedente
 * su cui stimare σ e i percentili.
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

const N = 600;
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
const DAX = DRIVER_CARDS.find((c) => c.id === "DAX")!;

describe("composeCard — grafico di forza relativa", () => {
  const payload = composeCard(ORO, fullSeries());

  it("una linea per componente: asset + paniere + driver", () => {
    expect(payload.chart).not.toBeNull();
    expect(payload.chart!.series.map((s) => s.label)).toEqual([
      "Oro",
      "Argento",
      "Rendimento reale USA 10Y",
      "Breakeven inflazione 10Y",
      "Dollar index (broad)",
    ]);
  });

  it("l'asset è marcato come riferimento, gli altri no", () => {
    const roles = payload.chart!.series.map((s) => s.role);
    expect(roles[0]).toBe("main");
    expect(roles.slice(1)).toEqual(["basket", "driver", "driver", "driver"]);
  });

  it("il rame non compare da nessuna parte: nessuna linea, nessun messaggio", () => {
    const json = JSON.stringify(payload).toLowerCase();
    expect(json).not.toContain("rame");
    expect(json).not.toContain("assente");
    expect(json).not.toContain("non disponibil");
  });

  it("ogni linea parte da 0 e ha un valore per ogni data della finestra", () => {
    const n = payload.chart!.dates.length;
    for (const s of payload.chart!.series) {
      expect(s.values).toHaveLength(n);
      expect(s.values[0]).toBe(0);
      expect(s.last).toBe(s.values[n - 1]);
    }
  });

  it("la finestra copre 12 mesi e finisce sull'ultima seduta comune", () => {
    const d = payload.chart!.dates;
    expect(d[d.length - 1]).toBe(payload.calendar.end);
    const spanDays =
      (Date.parse(d[d.length - 1]) - Date.parse(d[0])) / 86_400_000;
    expect(spanDays).toBeLessThanOrEqual(CHART_WINDOW_DAYS);
    expect(spanDays).toBeGreaterThan(CHART_WINDOW_DAYS - 10);
  });

  it("ogni linea porta con sé cosa significa che sale (chiave di lettura)", () => {
    for (const s of payload.chart!.series) {
      expect(s.risingMeans).toMatch(/in salita = /);
    }
  });

  it("VERIFICA INDIPENDENTE: l'indice dell'oro ricostruito a parte", () => {
    const series = fullSeries();
    const gold = series.XAUUSD!.map((o) => o.value);
    // rendimenti log su TUTTA la storia comune (le serie sintetiche
    // condividono le stesse date, quindi il calendario comune coincide)
    const r = gold.slice(1).map((v, i) => Math.log(v / gold[i]));
    // σ campionaria (n−1) su tutta la storia, non solo sulla finestra
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(
      r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1),
    );
    const line = payload.chart!.series.find((s) => s.label === "Oro")!;
    const w = payload.chart!.dates.length - 1; // variazioni dentro la finestra
    let acc = 0;
    for (let i = r.length - w; i < r.length; i += 1) acc += r[i] / sd;
    expect(line.last).toBeCloseTo(acc, 10);
  });

  it("la media NON viene sottratta: l'indice resta sulla scala grezza", () => {
    const series = fullSeries();
    const gold = series.XAUUSD!.map((o) => o.value);
    const r = gold.slice(1).map((v, i) => Math.log(v / gold[i]));
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(
      r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1),
    );
    const line = payload.chart!.series.find((s) => s.label === "Oro")!;
    const w = payload.chart!.dates.length - 1;
    let demeaned = 0;
    for (let i = r.length - w; i < r.length; i += 1) {
      demeaned += (r[i] - mean) / sd;
    }
    // se la media fosse sottratta i due valori coinciderebbero
    expect(line.last).not.toBeCloseTo(demeaned, 6);
  });
});

describe("composeCard — nessun driver invertito di segno", () => {
  it("il dollar index sale quando il dollaro si rafforza, senza capovolgimenti", () => {
    const series = fullSeries();
    const dxy = series.DTWEXBGS!;
    // dollaro in rialzo deciso nell'ultimo tratto
    series.DTWEXBGS = dxy.map((o, i) => ({
      date: o.date,
      value: i < N - 60 ? o.value : o.value * (1 + (i - (N - 60)) / 500),
    }));
    const payload = composeCard(ORO, series);
    const line = payload.chart!.series.find((s) => s.label.includes("Dollar"))!;
    const v = line.values;
    // l'ultimo tratto dell'indice deve SALIRE, non essere capovolto
    expect(v[v.length - 1]).toBeGreaterThan(v[v.length - 61]);
  });
});

describe("composeCard — componenti mancanti: omessi in silenzio", () => {
  it("senza Brent la scheda WTI perde quelle linee, senza dirlo", () => {
    const series = fullSeries();
    delete series.BRENT;
    const payload = composeCard(WTI_CARD, series);
    expect(payload.chart!.series.map((s) => s.label)).toEqual([
      "Petrolio WTI",
      "Dollar index (broad)",
      "Breakeven inflazione 10Y",
    ]);
    // niente Brent, niente spread, e nessun messaggio al loro posto
    expect(JSON.stringify(payload)).not.toContain("Brent");
    expect(payload.relations.map((r) => r.label)).toEqual([
      "Dollar index (broad)",
      "Breakeven inflazione 10Y",
    ]);
  });

  it("senza un componente del paniere DAX il combinato resta, sui superstiti", () => {
    const series = fullSeries();
    delete series.CAC40;
    const payload = composeCard(DAX, series);
    expect(payload.chart!.series.map((s) => s.label)).toEqual([
      "DAX",
      "Paniere azionario",
      "EURUSD",
      "Bund 10Y",
    ]);
    // e resta una media dei DUE membri rimasti, non un residuo a tre
    expect(JSON.stringify(payload)).not.toContain("CAC");
  });

  it("con UN solo membro superstite non c'è niente da combinare: resta col suo nome", () => {
    const series = fullSeries();
    delete series.CAC40;
    delete series.STOXX50E;
    const payload = composeCard(DAX, series);
    expect(payload.chart!.series.map((s) => s.label)).toEqual([
      "DAX",
      "S&P 500",
      "EURUSD",
      "Bund 10Y",
    ]);
    expect(payload.relations[0].label).toBe("S&P 500");
  });

  it("serie principale assente → errore, mai una scheda muta", () => {
    const series = fullSeries();
    delete series.XAUUSD;
    expect(() => composeCard(ORO, series)).toThrow(MissingSeriesError);
  });

  it("composeAllCards omette la scheda che non si può comporre", () => {
    const series = fullSeries();
    delete series.GER40;
    const { cards, errors } = composeAllCards(series);
    expect(cards.map((c) => c.id)).toEqual(["ORO", "WTI"]);
    // l'errore resta per i log del server, non per la pagina
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe("DAX");
  });

  it("storia troppo corta: nessun grafico, e comunque nessun messaggio", () => {
    const series = fullSeries();
    for (const key of Object.keys(series) as DriverDeskSeries[]) {
      series[key] = series[key]!.slice(-10);
    }
    const payload = composeCard(ORO, series);
    expect(payload.chart).toBeNull();
    expect(JSON.stringify(payload).toLowerCase()).not.toContain(
      "non disponibil",
    );
  });
});

describe("composeCard — stabilità della relazione", () => {
  const payload = composeCard(ORO, fullSeries());

  it("INVARIANTE: ogni linea del grafico (tranne l'asset) ha la sua voce", () => {
    const linee = payload
      .chart!.series.filter((s) => s.role !== "main")
      .map((s) => s.label);
    expect(payload.relations.map((r) => r.label)).toEqual(linee);
  });

  it("il paniere è incluso, non solo i driver macro", () => {
    const argento = payload.relations.find((r) => r.label === "Argento");
    expect(argento).toBeDefined();
    expect(argento!.role).toBe("basket");
    expect(payload.relations.filter((r) => r.role === "driver")).toHaveLength(3);
  });

  it("ogni voce dichiara il segno OSSERVATO", () => {
    for (const r of payload.relations) {
      expect(r.signSentence).toMatch(/correlazione osservata/);
      expect(Math.abs(r.rho)).toBeLessThanOrEqual(1);
    }
  });

  it("VERIFICA INDIPENDENTE: ρ60 oro↔argento (membro del paniere) col Pearson naive", () => {
    const series = fullSeries();
    const gold = series.XAUUSD!.map((o) => o.value);
    const silver = series.XAGUSD!.map((o) => o.value);
    const logret = (xs: number[]) =>
      xs.slice(1).map((v, i) => Math.log(v / xs[i]));
    const rg = logret(gold).slice(-60);
    const rs = logret(silver).slice(-60);
    const n = 60;
    const sx = rg.reduce((a, b) => a + b, 0);
    const sy = rs.reduce((a, b) => a + b, 0);
    const sxx = rg.reduce((a, b) => a + b * b, 0);
    const syy = rs.reduce((a, b) => a + b * b, 0);
    const sxy = rg.reduce((a, b, i) => a + b * rs[i], 0);
    const expected =
      (n * sxy - sx * sy) /
      (Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy));
    const rel = payload.relations.find((r) => r.label === "Argento")!;
    expect(rel.rho).toBeCloseTo(expected, 10);
  });

  it("le altre schede: paniere DAX combinato in una voce, WTI invariato", () => {
    const dax = composeCard(DAX, fullSeries());
    expect(dax.relations.map((r) => r.label)).toEqual([
      "Paniere azionario",
      "EURUSD",
      "Bund 10Y",
    ]);
    const wti = composeCard(WTI_CARD, fullSeries());
    expect(wti.relations.map((r) => r.label)).toEqual([
      "Brent",
      "Dollar index (broad)",
      "Breakeven inflazione 10Y",
      "Spread WTI−Brent",
    ]);
  });

  it("VERIFICA INDIPENDENTE: la linea del paniere DAX è la media punto per punto delle tre linee", () => {
    const series = fullSeries();
    const payload = composeCard(DAX, series);
    const combined = payload.chart!.series.find(
      (s) => s.label === "Paniere azionario",
    )!;
    // ricostruzione a mano: per ciascun membro, indice standardizzato con la
    // PROPRIA sigma storica, poi media dei tre valori in un punto qualunque
    const idx = 100; // un punto a caso dentro la finestra
    const w = payload.chart!.dates.length - 1;
    const memberValueAt = (code: "STOXX50E" | "CAC40" | "SPX") => {
      const levels = series[code]!.map((o) => o.value);
      const r = levels.slice(1).map((v, i) => Math.log(v / levels[i]));
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      const sd = Math.sqrt(
        r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1),
      );
      let acc = 0;
      for (let i = r.length - w; i < r.length - w + idx; i += 1) acc += r[i] / sd;
      return acc;
    };
    const expected =
      (memberValueAt("STOXX50E") + memberValueAt("CAC40") + memberValueAt("SPX")) / 3;
    expect(combined.values[idx]).toBeCloseTo(expected, 10);
  });

  it("VERIFICA INDIPENDENTE: rho60 DAX-paniere sul ritorno medio equal-weight", () => {
    const series = fullSeries();
    const payload = composeCard(DAX, series);
    const logret = (code: DriverDeskSeries) => {
      const xs = series[code]!.map((o) => o.value);
      return xs.slice(1).map((v, i) => Math.log(v / xs[i]));
    };
    const rDax = logret("GER40").slice(-60);
    const members = ["STOXX50E", "CAC40", "SPX"] as const;
    const rBasket = logret(members[0]).map(
      (_, i) => members.reduce((a, m) => a + logret(m)[i], 0) / members.length,
    ).slice(-60);
    const n = 60;
    const sx = rDax.reduce((a, b) => a + b, 0);
    const sy = rBasket.reduce((a, b) => a + b, 0);
    const sxx = rDax.reduce((a, b) => a + b * b, 0);
    const syy = rBasket.reduce((a, b) => a + b * b, 0);
    const sxy = rDax.reduce((a, b, i) => a + b * rBasket[i], 0);
    const expected =
      (n * sxy - sx * sy) /
      (Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy));
    const rel = payload.relations.find((r) => r.label === "Paniere azionario")!;
    expect(rel.rho).toBeCloseTo(expected, 10);
  });

  it("VERIFICA INDIPENDENTE: ρ60 oro↔dollaro col Pearson naive", () => {
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

describe("composeCard — chiave di lettura per scheda (R7)", () => {
  it("una voce per ogni linea presente, asset escluso, nell'ordine del grafico", () => {
    const oro = composeCard(ORO, fullSeries());
    expect(oro.guide.map((g) => g.label)).toEqual([
      "Argento",
      "Rendimento reale USA 10Y",
      "Breakeven inflazione 10Y",
      "Dollar index (broad)",
    ]);
    const dax = composeCard(DAX, fullSeries());
    expect(dax.guide.map((g) => g.label)).toEqual([
      "Paniere azionario",
      "EURUSD",
      "Bund 10Y",
    ]);
  });

  it("framing storico: le voci direzionali dicono «storicamente», mai una regola", () => {
    const oro = composeCard(ORO, fullSeries());
    for (const g of oro.guide) {
      expect(g.text).toContain("storicamente");
      expect(g.text).not.toMatch(/→/);
    }
  });

  it("componente assente = voce assente, in silenzio", () => {
    const series = fullSeries();
    delete series.BRENT; // decade anche lo spread
    const wti = composeCard(WTI_CARD, series);
    expect(wti.guide.map((g) => g.label)).toEqual([
      "Dollar index (broad)",
      "Breakeven inflazione 10Y",
    ]);
  });

  it("paniere DAX degradato a un membro: la voce è quella del membro", () => {
    const series = fullSeries();
    delete series.CAC40;
    delete series.STOXX50E;
    const dax = composeCard(DAX, series);
    expect(dax.guide[0].label).toBe("S&P 500");
    expect(dax.guide[0].text).toContain("stessa direzione del DAX");
  });
});
