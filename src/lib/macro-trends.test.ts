import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-05 — contratto delle promise di streaming: `getTrendsSection` e
 * `getTrendsRecessions` alimentano `use()` nei client component, quindi
 * NON devono mai rigettare — la serie fallita diventa card in errore, le
 * recessioni mancanti diventano zero bande. La rete è mockata: qui si
 * testa l'orchestrazione, i fetch veri stanno in fred.ts.
 */

const fetchFredSeries = vi.fn();

vi.mock("@/lib/fred", () => ({
  fetchFredSeries: (...args: unknown[]) => fetchFredSeries(...args),
  hasFredApiKey: () => false,
}));

import { getTrendsRecessions, getTrendsSection } from "./macro-trends";
import { TRENDS_SERIES } from "./macro-trends-series";

/** Osservazioni mensili sintetiche, abbastanza lunghe per ogni transform. */
function monthlyObservations(years: number) {
  const out: { date: string; value: number }[] = [];
  for (let y = 2000; y < 2000 + years; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      out.push({
        date: `${y}-${String(m).padStart(2, "0")}-01`,
        value: 100 + out.length * 0.3,
      });
    }
  }
  return out;
}

beforeEach(() => {
  fetchFredSeries.mockReset();
});

describe("getTrendsSection", () => {
  const defs = TRENDS_SERIES.filter((d) => d.section === "inflazione").slice(
    0,
    2,
  );

  it("serie risolte in ordine di registry, status ok", async () => {
    fetchFredSeries.mockResolvedValue({
      id: "X",
      observations: monthlyObservations(30),
    });
    const views = await getTrendsSection([...defs]);
    expect(views.map((v) => v.def.key)).toEqual(defs.map((d) => d.key));
    expect(views.every((v) => v.status === "ok")).toBe(true);
  });

  it("una serie che fallisce diventa card in errore, MAI un reject", async () => {
    fetchFredSeries
      .mockRejectedValueOnce(new Error("rete giù"))
      .mockResolvedValue({ id: "X", observations: monthlyObservations(30) });
    const views = await getTrendsSection([...defs]);
    expect(views[0].status).toBe("error");
    expect(views[0].error).toContain("rete giù");
    expect(views[0].points).toEqual([]);
    expect(views[1].status).toBe("ok");
  });
});

describe("getTrendsRecessions", () => {
  it("USREC 0/1 → bande [from, to]", async () => {
    fetchFredSeries.mockResolvedValue({
      id: "USREC",
      observations: [
        { date: "2020-01-01", value: 0 },
        { date: "2020-02-01", value: 1 },
        { date: "2020-03-01", value: 1 },
        { date: "2020-04-01", value: 0 },
      ],
    });
    await expect(getTrendsRecessions()).resolves.toEqual([
      { from: "2020-02-01", to: "2020-04-01" },
    ]);
  });

  it("fetch fallito → zero bande, MAI un reject", async () => {
    fetchFredSeries.mockRejectedValue(new Error("timeout"));
    await expect(getTrendsRecessions()).resolves.toEqual([]);
  });
});
