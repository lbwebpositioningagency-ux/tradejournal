import { describe, expect, it } from "vitest";
import {
  aggregateQuarters,
  quarterLogReturns,
  type QuarterBar,
} from "@/lib/seasonality/quarter";

/** Serie M15 continua da un istante, con un fattore per barra. */
function serie(
  fromIso: string,
  count: number,
  factorFor: (i: number) => number,
): QuarterBar[] {
  const out: QuarterBar[] = [];
  let close = 100;
  const t0 = new Date(fromIso).getTime();
  for (let i = 0; i < count; i += 1) {
    close *= factorFor(i);
    out.push({ ts: new Date(t0 + i * 900_000), close });
  }
  return out;
}

describe("quarterLogReturns — la guardia dei buchi", () => {
  it("un rendimento esiste solo se la barra prima è 15 minuti prima", () => {
    const bars: QuarterBar[] = [
      { ts: new Date("2024-03-01T10:00:00Z"), close: 100 },
      { ts: new Date("2024-03-01T10:15:00Z"), close: 101 },
      // buco di un mese: la barra dopo NON deve produrre rendimento
      { ts: new Date("2024-04-01T10:00:00Z"), close: 130 },
      { ts: new Date("2024-04-01T10:15:00Z"), close: 131 },
    ];
    const r = quarterLogReturns(bars);
    expect(r).toHaveLength(2);
    // il salto 101 → 130 (+28%) non compare da nessuna parte
    for (const x of r) expect(Math.abs(x.r)).toBeLessThan(0.05);
  });

  it("il salto del fine settimana non entra in nessun bucket", () => {
    const bars: QuarterBar[] = [
      { ts: new Date("2024-03-01T21:45:00Z"), close: 100 }, // venerdì sera
      { ts: new Date("2024-03-03T22:00:00Z"), close: 108 }, // domenica sera
      { ts: new Date("2024-03-03T22:15:00Z"), close: 108.1 },
    ];
    const r = quarterLogReturns(bars);
    expect(r).toHaveLength(1);
    expect(r[0].ts.toISOString()).toBe("2024-03-03T22:15:00.000Z");
  });
});

describe("aggregateQuarters", () => {
  it("produce 96 bucket per orologio e conta le barre vere", () => {
    // due giorni pieni: 192 barre, quindi 191 rendimenti adiacenti
    const bars = serie("2024-03-05T00:00:00Z", 192, () => 1.0001);
    const aggs = aggregateQuarters(bars);

    const utc = aggs.filter((a) => a.clock === "UTC");
    const rome = aggs.filter((a) => a.clock === "ROME");
    expect(new Set(utc.map((a) => a.bucket)).size).toBe(96);
    expect(new Set(rome.map((a) => a.bucket)).size).toBe(96);

    // ogni orologio vede gli stessi 191 rendimenti, ripartiti diversamente
    const totUtc = utc.reduce((a, x) => a + x.bars, 0);
    const totRome = rome.reduce((a, x) => a + x.bars, 0);
    expect(totUtc).toBe(191);
    expect(totRome).toBe(191);
  });

  it("i bucket seguono l'OROLOGIO: Roma è avanti rispetto a UTC", () => {
    const bars = serie("2024-03-05T00:00:00Z", 192, () => 1.0001);
    const aggs = aggregateQuarters(bars);
    // marzo: Roma è UTC+1, quindi le 00:15 UTC sono le 01:15 a Roma —
    // bucket 1 in UTC, bucket 5 a Roma (quattro quarti d'ora più avanti).
    const utc1 = aggs.find((a) => a.clock === "UTC" && a.bucket === 1);
    const rome5 = aggs.find((a) => a.clock === "ROME" && a.bucket === 5);
    expect(utc1?.bars).toBe(rome5?.bars);
  });

  it("l'anno è quello dell'orologio, non UTC", () => {
    // 31 dicembre 23:15 UTC = 1° gennaio 00:15 a Roma
    const bars: QuarterBar[] = [
      { ts: new Date("2024-12-31T23:00:00Z"), close: 100 },
      { ts: new Date("2024-12-31T23:15:00Z"), close: 100.5 },
    ];
    const aggs = aggregateQuarters(bars);
    const utc = aggs.find((a) => a.clock === "UTC");
    const rome = aggs.find((a) => a.clock === "ROME");
    expect(utc?.year).toBe(2024);
    expect(rome?.year).toBe(2025);
  });

  it("una serie con drift costante dà la stessa media in ogni bucket", () => {
    const bars = serie("2024-03-05T00:00:00Z", 385, () => 1.0002);
    const aggs = aggregateQuarters(bars).filter((a) => a.clock === "UTC");
    const medie = aggs.map((a) => a.mean);
    const atteso = Math.log(1.0002);
    for (const m of medie) expect(m).toBeCloseTo(atteso, 10);
  });
});
