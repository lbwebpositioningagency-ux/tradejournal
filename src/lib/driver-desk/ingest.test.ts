import { describe, expect, it } from "vitest";
import { DRIVER_SERIES_BY_CODE } from "@/lib/driver-desk/catalog";
import { normalizeObservations, qaSeries } from "@/lib/driver-desk/ingest";

const DFII10 = DRIVER_SERIES_BY_CODE.get("DFII10")!;
const XAUUSD = DRIVER_SERIES_BY_CODE.get("XAUUSD")!;

describe("normalizeObservations", () => {
  it("dedup sulla data (l'ultima vince), ordina, scarta i non finiti", () => {
    const out = normalizeObservations(
      [
        { date: "2024-01-03", value: 3 },
        { date: "2024-01-01", value: 1 },
        { date: "2024-01-01", value: 1.5 },
        { date: "2024-01-02", value: NaN },
      ],
      true,
    );
    expect(out).toEqual([
      { date: "2024-01-01", value: 1.5 },
      { date: "2024-01-03", value: 3 },
    ]);
  });

  it("i valori ≤ 0 si scartano SOLO per i prezzi: un tasso negativo è un dato", () => {
    const obs = [
      { date: "2020-12-11", value: -0.64 },
      { date: "2020-12-14", value: 0 },
    ];
    // prezzo: entrambi scartati
    expect(normalizeObservations(obs, true)).toEqual([]);
    // tasso: il negativo resta (lo zero pure: è un livello legittimo)
    expect(normalizeObservations(obs, false)).toEqual(obs);
  });
});

describe("qaSeries — segnala, non corregge", () => {
  it("buco oltre 9 giorni civili segnalato", () => {
    const out = qaSeries(XAUUSD, [
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 101 },
      { date: "2024-01-20", value: 102 },
    ]);
    expect(out.some((f) => f.kind === "buco" && f.detail.includes("2024-01-20"))).toBe(true);
  });

  it("weekend e ponti ordinari NON sono buchi", () => {
    const out = qaSeries(XAUUSD, [
      { date: "2024-03-28", value: 100 }, // giovedì santo
      { date: "2024-04-02", value: 101 }, // martedì dopo Pasquetta
    ]);
    expect(out.filter((f) => f.kind === "buco")).toHaveLength(0);
  });

  it("rendimento log oltre |0.25| segnalato come anomalia (precedente DV1X ×1000)", () => {
    const out = qaSeries(XAUUSD, [
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 100000 }, // un ×1000 da bug di unità
    ]);
    expect(out.some((f) => f.kind === "anomalia")).toBe(true);
  });

  it("serie a differenze: anomalia oltre 5σ delle Δ", () => {
    const obs = Array.from({ length: 100 }, (_, i) => ({
      date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
      value: 2 + (i % 2 === 0 ? 0.01 : -0.01),
    }));
    // ultima osservazione: salto enorme
    obs.push({ date: "2024-06-01", value: 9 });
    const out = qaSeries(DFII10, obs);
    expect(out.some((f) => f.kind === "anomalia" && f.detail.includes("2024-06-01"))).toBe(true);
  });

  it("serie pulita → nessun finding", () => {
    const obs = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 100.5 },
      { date: "2024-01-03", value: 100.2 },
    ];
    expect(qaSeries(XAUUSD, obs)).toEqual([]);
  });
});
