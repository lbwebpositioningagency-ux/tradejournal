import { describe, expect, it } from "vitest";
import { revalidateSecondsFor } from "./fred";
import { RECESSION_SERIES_ID, TRENDS_SERIES } from "./macro-trends-series";

/**
 * P-05 — scadenze di cache scaglionate per serie: il jitter deve essere
 * deterministico (la chiave di cache resta stabile tra build e istanze),
 * dentro la banda dichiarata (24 h ± 3 h) e distribuito (non tutte le
 * serie sulla stessa scadenza, che era il problema di partenza).
 */
describe("revalidateSecondsFor", () => {
  const DAY = 86_400;
  const JITTER = 10_800;

  it("deterministico: stesso ID → stesso valore", () => {
    expect(revalidateSecondsFor("DGS10")).toBe(revalidateSecondsFor("DGS10"));
  });

  it("sempre dentro la banda 24h ± 3h, per TUTTI gli ID del registry", () => {
    const ids = [
      RECESSION_SERIES_ID,
      ...TRENDS_SERIES.flatMap((def) => def.fredIds),
    ];
    for (const id of ids) {
      const seconds = revalidateSecondsFor(id);
      expect(seconds).toBeGreaterThanOrEqual(DAY - JITTER);
      expect(seconds).toBeLessThanOrEqual(DAY + JITTER);
    }
  });

  it("le scadenze sono distribuite, non sincronizzate", () => {
    const ids = TRENDS_SERIES.map((def) => def.fredIds[0]);
    const distinct = new Set(ids.map((id) => revalidateSecondsFor(id)));
    // Con ~50 serie su una banda di 21.601 valori possibili, una manciata
    // di collisioni è fisiologica: il fallimento da intercettare è la
    // degenerazione (tutte uguali o quasi).
    expect(distinct.size).toBeGreaterThan(ids.length / 2);
  });
});
