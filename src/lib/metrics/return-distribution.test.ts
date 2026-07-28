import { describe, expect, it } from "vitest";
import {
  targetRBucketStats,
  targetRTotals,
  type TargetRBucketInput,
} from "./return-distribution";

const row = (over: Partial<TargetRBucketInput> = {}): TargetRBucketInput => ({
  bucket: "1to2",
  trades: 10,
  hits: 4,
  avgR: "0.35",
  p25: "-1",
  p50: "0.2",
  p75: "1.5",
  minR: "-1.2",
  maxR: "2",
  sumR: "3.5",
  ...over,
});

describe("targetRBucketStats", () => {
  it("riempie tutti e quattro i bucket nell'ordine canonico", () => {
    const stats = targetRBucketStats([row({ bucket: "2to3" })]);
    expect(stats.map((s) => s.bucket)).toEqual(["le1", "1to2", "2to3", "gt3"]);
    expect(stats.map((s) => s.label)).toEqual(["≤ 1R", "1-2R", "2-3R", "> 3R"]);
  });

  it("un bucket senza trade resta a zero con le medie NULL, mai zero finto", () => {
    const [le1] = targetRBucketStats([row({ bucket: "1to2" })]);
    expect(le1.trades).toBe(0);
    expect(le1.hitRate).toBeNull();
    expect(le1.expectancyR).toBeNull();
  });

  it("hit rate come frazione a 4 decimali", () => {
    const stats = targetRBucketStats([row({ trades: 8, hits: 3 })]);
    const bucket = stats.find((s) => s.bucket === "1to2")!;
    expect(bucket.hitRate).toBe("0.3750");
  });

  it("hit rate 0 su trade presenti è un risultato, non un dato mancante", () => {
    const stats = targetRBucketStats([row({ trades: 5, hits: 0 })]);
    expect(stats.find((s) => s.bucket === "1to2")!.hitRate).toBe("0.0000");
  });

  it("expectancy in R = media dell'R realizzato, a 4 decimali", () => {
    const stats = targetRBucketStats([row({ avgR: "0.4166666" })]);
    expect(stats.find((s) => s.bucket === "1to2")!.expectancyR).toBe("0.4167");
  });

  it("porta avanti quartili ed estremi per il box plot", () => {
    const bucket = targetRBucketStats([row()]).find((s) => s.bucket === "1to2")!;
    expect([bucket.p25, bucket.p50, bucket.p75]).toEqual([
      "-1.0000",
      "0.2000",
      "1.5000",
    ]);
    expect([bucket.minR, bucket.maxR]).toEqual(["-1.2000", "2.0000"]);
  });
});

describe("targetRTotals", () => {
  it("somma i bucket e ricalcola i tassi sul totale", () => {
    const stats = targetRBucketStats([
      row({ bucket: "le1", trades: 10, hits: 6, sumR: "1.0" }),
      row({ bucket: "gt3", trades: 10, hits: 2, sumR: "4.0" }),
    ]);
    const totals = targetRTotals(stats);
    expect(totals.trades).toBe(20);
    expect(totals.hits).toBe(8);
    expect(totals.hitRate).toBe("0.4000");
    expect(totals.sumR).toBe("5.0000");
    expect(totals.expectancyR).toBe("0.2500");
  });

  it("senza trade non inventa tassi", () => {
    const totals = targetRTotals(targetRBucketStats([]));
    expect(totals).toEqual({
      trades: 0,
      hits: 0,
      hitRate: null,
      expectancyR: null,
      sumR: null,
    });
  });

  it("un target ambizioso con hit rate basso può battere uno vicino", () => {
    // Il caso che la §3 esiste per rendere visibile: 20% di hit a 4R rende
    // più del 60% di hit a 1R.
    const stats = targetRBucketStats([
      row({ bucket: "le1", trades: 100, hits: 60, sumR: "20", avgR: "0.20" }),
      row({ bucket: "gt3", trades: 100, hits: 20, sumR: "45", avgR: "0.45" }),
    ]);
    const le1 = stats.find((s) => s.bucket === "le1")!;
    const gt3 = stats.find((s) => s.bucket === "gt3")!;
    expect(Number(le1.hitRate)).toBeGreaterThan(Number(gt3.hitRate));
    expect(Number(gt3.expectancyR)).toBeGreaterThan(Number(le1.expectancyR));
  });
});
