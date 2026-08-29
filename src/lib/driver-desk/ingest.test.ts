import { describe, expect, it } from "vitest";
import { DRIVER_SERIES, DRIVER_SERIES_BY_CODE } from "@/lib/driver-desk/catalog";
import {
  deltaWindowStart,
  isWeekendKey,
  normalizeObservations,
  qaSeries,
  runDriverDeskDeltaIngest,
} from "@/lib/driver-desk/ingest";

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

  it("scarta sabato e domenica: la domenica Dukascopy è una coda di due ore, non una seduta", () => {
    const out = normalizeObservations(
      [
        { date: "2026-08-21", value: 1 }, // venerdì
        { date: "2026-08-22", value: 2 }, // sabato
        { date: "2026-08-23", value: 3 }, // domenica
        { date: "2026-08-24", value: 4 }, // lunedì
      ],
      true,
    );
    expect(out).toEqual([
      { date: "2026-08-21", value: 1 },
      { date: "2026-08-24", value: 4 },
    ]);
  });
});

describe("isWeekendKey", () => {
  it("non dipende dal fuso della macchina: la chiave si legge in UTC", () => {
    expect(isWeekendKey("2026-08-21")).toBe(false); // venerdì
    expect(isWeekendKey("2026-08-22")).toBe(true); // sabato
    expect(isWeekendKey("2026-08-23")).toBe(true); // domenica
    expect(isWeekendKey("2026-08-24")).toBe(false); // lunedì
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

/**
 * Ingest DELTA (riparazione del 13/08/2026): dal 04/08 il Driver Desk era
 * fermo perché nessun job scriveva DriverDeskBar — il popolamento era stato
 * un backfill manuale una tantum. Il delta gira nel cron notturno: riscrive
 * solo la coda recente della serie e non tocca mai lo storico.
 */
describe("deltaWindowStart", () => {
  it("arretra di DELTA_WINDOW_DAYS giorni civili dall'ultima data", () => {
    expect(deltaWindowStart("2026-08-04")).toBe("2026-07-21");
  });

  it("attraversa i confini di mese e anno senza rollover", () => {
    expect(deltaWindowStart("2026-01-05")).toBe("2025-12-22");
  });
});

describe("runDriverDeskDeltaIngest — comportamenti senza rete", () => {
  const coverageVuota = {
    driverDeskCoverage: { findMany: async () => [] },
  } as unknown as Parameters<typeof runDriverDeskDeltaIngest>[0];

  it("una serie mai popolata si salta dichiarandolo: il primo carico resta manuale", async () => {
    const esito = await runDriverDeskDeltaIngest(coverageVuota);
    expect(esito.completo).toBe(true);
    expect(esito.results).toHaveLength(DRIVER_SERIES.length);
    for (const r of esito.results) {
      expect(r.ok).toBe(false);
      expect(r.error).toContain("mai popolata");
    }
  });

  it("a budget esaurito le serie restanti sono rinviate e completo è false", async () => {
    const esito = await runDriverDeskDeltaIngest(coverageVuota, { budgetMs: -1 });
    expect(esito.completo).toBe(false);
    for (const r of esito.results) {
      expect(r.ok).toBe(false);
      expect(r.error).toContain("budget");
    }
  });
});
