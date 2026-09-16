import { describe, expect, it } from "vitest";
import {
  aggregateStrategySeries,
  correlationAvailability,
  correlationEligible,
  correlationMatrix,
  correlationPeriodBounds,
  correlationPeriodKey,
  correlationTone,
  CORRELATION_MIN_OBSERVATIONS,
  isCompletePeriod,
  pairKey,
  type CorrelationSeries,
  type StrategyDayRow,
} from "./correlation";

function serie(key: string, values: Record<string, number>): CorrelationSeries {
  return {
    key,
    label: key,
    byPeriod: new Map(Object.entries(values).map(([p, v]) => [p, v.toFixed(2)])),
    trades: Object.keys(values).length,
  };
}

/** `n` settimane consecutive dal lunedì 5 gennaio 2026, con i valori dati da `f`. */
function weeks(n: number, f: (i: number) => number, from = 0): Record<string, number> {
  const start = Date.UTC(2026, 0, 5);
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      new Date(start + (i + from) * 7 * 86_400_000).toISOString().slice(0, 10),
      f(i),
    ]),
  );
}

describe("periodi di aggregazione", () => {
  it("la settimana è di calendario, da lunedì: ogni giorno va al suo lunedì", () => {
    expect(correlationPeriodKey("2026-09-14")).toBe("2026-09-14"); // lunedì
    expect(correlationPeriodKey("2026-09-18")).toBe("2026-09-14"); // venerdì
    // Un trade chiuso nel weekend resta nella settimana di quel lunedì.
    expect(correlationPeriodKey("2026-09-19")).toBe("2026-09-14");
    expect(correlationPeriodKey("2026-09-20")).toBe("2026-09-14");
    expect(correlationPeriodKey("2026-09-21")).toBe("2026-09-21");
  });

  it("la settimana attraversa il cambio d'anno senza spezzarsi", () => {
    expect(correlationPeriodKey("2026-01-01")).toBe("2025-12-29");
  });

  it("le sedute della settimana sono lunedì–venerdì", () => {
    expect(correlationPeriodBounds("2026-09-14")).toEqual({ first: "2026-09-14", last: "2026-09-18" });
    // A cavallo di mese e d'anno il venerdì si conta sul calendario vero.
    expect(correlationPeriodBounds("2026-02-23")).toEqual({ first: "2026-02-23", last: "2026-02-27" });
    expect(correlationPeriodBounds("2025-12-29")).toEqual({ first: "2025-12-29", last: "2026-01-02" });
  });

  it("un periodo tagliato dall'intervallo non è completo, a sinistra come a destra", () => {
    const range = { fromKey: "2026-09-16", toKey: "2026-10-14" };
    expect(isCompletePeriod("2026-09-14", range)).toBe(false); // inizia prima
    expect(isCompletePeriod("2026-09-21", range)).toBe(true);
    expect(isCompletePeriod("2026-10-12", range)).toBe(false); // venerdì 16 dopo la fine
  });

  it("per la settimana basta che il venerdì sia dentro: il weekend non taglia", () => {
    expect(isCompletePeriod("2026-09-14", { toKey: "2026-09-18" })).toBe(true);
    expect(isCompletePeriod("2026-09-14", { toKey: "2026-09-17" })).toBe(false);
  });

  it("senza inizio (tutto lo storico) il primo periodo non è tagliato da nulla", () => {
    expect(isCompletePeriod("2020-01-06", { toKey: "2026-09-16" })).toBe(true);
  });
});

describe("aggregateStrategySeries — dai giorni ai periodi", () => {
  const row = (strategyId: string, day: string, netPnl: string, trades = 1): StrategyDayRow => ({
    strategyId,
    strategyName: strategyId.toUpperCase(),
    day,
    netPnl,
    trades,
  });

  it("somma esatta dei giorni della stessa settimana, Decimal e non float", () => {
    const { series } = aggregateStrategySeries(
      [row("a", "2026-09-14", "0.10"), row("a", "2026-09-15", "0.20"), row("a", "2026-09-21", "-5.00")],
      { toKey: "2026-12-31" },
    );
    expect(series[0].byPeriod.get("2026-09-14")).toBe("0.30");
    expect(series[0].byPeriod.get("2026-09-21")).toBe("-5.00");
    expect(series[0].trades).toBe(3);
  });

  it("i periodi parziali restano fuori e si contano", () => {
    const out = aggregateStrategySeries(
      [row("a", "2026-09-14", "10"), row("a", "2026-09-21", "10"), row("a", "2026-09-30", "10")],
      { fromKey: "2026-09-15", toKey: "2026-09-30" },
    );
    expect([...out.series[0].byPeriod.keys()]).toEqual(["2026-09-21"]);
    expect(out.partialPeriods).toBe(2);
    expect(out.periods).toBe(1);
  });

  it("la settimana in corso (non ancora finita) non entra", () => {
    const out = aggregateStrategySeries(
      [row("a", "2026-09-08", "10"), row("a", "2026-09-15", "10")],
      { toKey: "2026-09-16" },
    );
    expect([...out.series[0].byPeriod.keys()]).toEqual(["2026-09-07"]);
    expect(out.partialPeriods).toBe(1);
  });

  it("le serie escono ordinate per trade, dalla più operata", () => {
    const { series } = aggregateStrategySeries(
      [row("a", "2026-08-10", "1"), row("b", "2026-08-10", "1", 5)],
      { toKey: "2026-12-31" },
    );
    expect(series.map((s) => s.key)).toEqual(["b", "a"]);
  });
});

describe("correlationMatrix — P&L per periodo di due strategie", () => {
  it("soglia: 30 settimane in comune, non 30 giorni divisi per cinque", () => {
    expect(CORRELATION_MIN_OBSERVATIONS).toBe(30);
  });

  it("serie identiche → +1, opposte → −1", () => {
    const v = weeks(40, (i) => Math.sin(i) * 100);
    const opp = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, -x]));
    expect(Number(correlationMatrix([serie("a", v), serie("b", v)]).pairs.get(pairKey("a", "b"))!.r)).toBeCloseTo(1, 6);
    expect(Number(correlationMatrix([serie("a", v), serie("b", opp)]).pairs.get(pairKey("a", "b"))!.r)).toBeCloseTo(-1, 6);
  });

  it("sotto 30 periodi in comune NON calcola, e dichiara quanti ce ne sono", () => {
    const pair = correlationMatrix(
      [serie("a", weeks(29, (i) => i)), serie("b", weeks(29, (i) => i))],
    ).pairs.get(pairKey("a", "b"))!;
    expect(pair.lowSample).toBe(true);
    expect(pair.r).toBeNull();
    expect(pair.noiseBand).toBeNull();
    expect(pair.common).toBe(29);
  });

  it("a soglia esatta calcola, con la banda di rumore 1,96/√n", () => {
    const pair = correlationMatrix(
      [serie("a", weeks(30, (i) => i)), serie("b", weeks(30, (i) => i * 3))],
    ).pairs.get(pairKey("a", "b"))!;
    expect(pair.lowSample).toBe(false);
    expect(pair.r).toBe("1.0000");
    expect(pair.noiseBand).toBe("0.3578");
  });

  it("una serie piatta → null, mai uno zero che si legge «indipendenti»", () => {
    const pair = correlationMatrix(
      [serie("a", weeks(40, () => 100)), serie("b", weeks(40, (i) => i))],
    ).pairs.get(pairKey("a", "b"))!;
    expect(pair.r).toBeNull();
    expect(pair.lowSample).toBe(false);
  });

  it("i periodi in cui opera UNA sola strategia sono esclusi dal calcolo, non messi a zero", () => {
    // 30 settimane in comune identiche, più 10 settimane della sola "a": se
    // quelle entrassero con lo zero di "b" il coefficiente scenderebbe sotto 1.
    const comuni = weeks(30, (i) => (i % 3) * 100 - 100);
    const soloA = weeks(10, () => 500, 30);
    const pair = correlationMatrix([serie("a", { ...comuni, ...soloA }), serie("b", comuni)]).pairs.get(pairKey("a", "b"))!;
    expect(pair.common).toBe(30);
    expect(pair.onlyOne).toBe(10);
    expect(pair.r).toBe("1.0000");
    expect(pair.noiseBand).toBe("0.3578"); // la banda usa i SOLI periodi del calcolo
  });

  it("molti periodi operati ma pochi in comune → nessun coefficiente", () => {
    const pair = correlationMatrix(
      [serie("a", weeks(40, (i) => i + 1)), serie("b", weeks(5, (i) => i + 1))],
    ).pairs.get(pairKey("a", "b"))!;
    expect(pair.common).toBe(5);
    expect(pair.onlyOne).toBe(35);
    expect(pair.lowSample).toBe(true);
  });

  it("tre serie → tre coppie, mai la diagonale; una serie sola → nessuna", () => {
    const m = correlationMatrix(
      [serie("a", weeks(40, (i) => i)), serie("b", weeks(40, (i) => -i)), serie("c", weeks(40, (i) => i % 7))],
    );
    expect(m.pairs.size).toBe(3);
    expect(m.pairs.has(pairKey("a", "a"))).toBe(false);
    expect(correlationMatrix([serie("a", weeks(40, (i) => i))]).pairs.size).toBe(0);
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });

  it("una strategia con meno periodi operati della soglia non entra in matrice", () => {
    expect(correlationEligible(serie("a", weeks(29, (i) => i)))).toBe(false);
    expect(correlationEligible(serie("a", weeks(30, (i) => i)))).toBe(true);
  });
});

describe("correlationAvailability — quando la correlazione non è calcolabile", () => {
  it("nessuna coppia sopra soglia: non calcolabile, e nomina la coppia più vicina", () => {
    const m = correlationMatrix(
      [serie("a", weeks(20, (i) => i)), serie("b", weeks(18, (i) => -i)), serie("c", weeks(9, (i) => i))],
    );
    const av = correlationAvailability(m);
    expect(av.usable).toBe(false);
    expect(av.closest?.common).toBe(18);
    expect(pairKey(av.closest!.a, av.closest!.b)).toBe(pairKey("a", "b"));
  });

  it("basta una coppia sopra soglia perché la correlazione sia calcolabile", () => {
    const m = correlationMatrix(
      [serie("a", weeks(35, (i) => i)), serie("b", weeks(35, (i) => i % 4)), serie("c", weeks(3, (i) => i))],
    );
    expect(correlationAvailability(m).usable).toBe(true);
  });

  it("meno di due strategie: nessuna coppia, nessuna più vicina", () => {
    expect(correlationAvailability(correlationMatrix([]))).toEqual({ usable: false, closest: null });
  });

  it("zero trade: nessuna serie, nessuna coppia", () => {
    const { series, periods } = aggregateStrategySeries([], { toKey: "2026-09-16" });
    expect(series).toEqual([]);
    expect(periods).toBe(0);
  });
});

describe("correlationTone — la lettura tiene il SEGNO e il rumore", () => {
  const band = "0.3578"; // 30 periodi in comune

  it("dentro la banda di rumore non si legge nessun verso", () => {
    expect(correlationTone({ r: "0.3000", noiseBand: band })).toBe("rumore");
    expect(correlationTone({ r: "-0.3000", noiseBand: band })).toBe("rumore");
  });

  it("+0,8 e −0,8 sono opposti: la prima moltiplica il rischio, la seconda lo copre", () => {
    expect(correlationTone({ r: "0.8000", noiseBand: band })).toBe("insieme-forte");
    expect(correlationTone({ r: "-0.8000", noiseBand: band })).toBe("opposte");
  });

  it("positiva fuori dal rumore ma sotto 0,6 → insieme", () => {
    expect(correlationTone({ r: "0.4500", noiseBand: band })).toBe("insieme");
  });

  it("nessun coefficiente → nessuna lettura", () => {
    expect(correlationTone({ r: null, noiseBand: null })).toBeNull();
  });
});
