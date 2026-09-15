import { describe, expect, it } from "vitest";
import {
  DRAWDOWN_BANDS,
  DRAWDOWN_EPISODES_MIN,
  drawdownDurationSummary,
  drawdownEpisodes,
  type DrawdownEpisode,
} from "./drawdown-episodes";

/** Serie a sedute consecutive con i P&L dati. */
function serie(pnl: number[]) {
  return pnl.map((v, i) => ({
    day: `2026-03-${String(i + 1).padStart(2, "0")}`,
    netPnl: v.toFixed(2),
  }));
}

describe("drawdownEpisodes", () => {
  it("un episodio: massimo → minimo → ritorno sul massimo", () => {
    // equity 10000 → 10100 (max) → 9900 → 9800 (min) → 10000 → 10150 (recupero)
    const [ep, ...resto] = drawdownEpisodes(serie([100, -200, -100, 200, 150]), "10000");
    expect(resto).toEqual([]);
    expect(ep.peakDay).toBe("2026-03-01");
    expect(ep.troughDay).toBe("2026-03-03");
    expect(ep.recoveryDay).toBe("2026-03-05");
    expect(ep.depth).toBe("300.00");
    expect(ep.depthPct).toBe("0.0297");
    expect(ep.durationSessions).toBe(4);
    expect(ep.declineSessions).toBe(2);
    expect(ep.recoverySessions).toBe(2);
  });

  it("tornare PARI al massimo chiude l'episodio", () => {
    const eps = drawdownEpisodes(serie([100, -50, 50]), "0");
    expect(eps).toHaveLength(1);
    expect(eps[0].recoveryDay).toBe("2026-03-03");
  });

  it("apertura in perdita: il massimo è il saldo di partenza", () => {
    const [ep] = drawdownEpisodes(serie([-100, 50, 60]), "1000");
    expect(ep.peakDay).toBeNull();
    expect(ep.durationSessions).toBe(3); // dal saldo (-1) alla terza seduta (2)
    expect(ep.declineSessions).toBe(1);
    expect(ep.recoverySessions).toBe(2);
  });

  it("l'episodio aperto a fine serie ha recoveryDay null e durata fino all'ultima seduta", () => {
    const eps = drawdownEpisodes(serie([100, -40, 0, -10, 0]), "0");
    expect(eps).toHaveLength(1);
    expect(eps[0].recoveryDay).toBeNull();
    expect(eps[0].durationSessions).toBe(4);
    expect(eps[0].troughDay).toBe("2026-03-04");
    expect(eps[0].recoverySessions).toBe(1);
  });

  it("sedute a P&L zero dentro la buca allungano la durata, non la profondità", () => {
    const [ep] = drawdownEpisodes(serie([100, -100, 0, 0, 0, 100]), "1000");
    expect(ep.durationSessions).toBe(5);
    expect(ep.depth).toBe("100.00");
  });

  it("episodi distinti restano distinti, in ordine", () => {
    const eps = drawdownEpisodes(serie([100, -10, 20, -30, 40]), "0");
    expect(eps.map((e) => e.durationSessions)).toEqual([2, 2]);
  });

  it("massimo ≤ 0: profondità in valuta sì, percentuale no", () => {
    const [ep] = drawdownEpisodes(serie([-100, 200]), "0");
    expect(ep.depth).toBe("100.00");
    expect(ep.depthPct).toBeNull();
  });

  it("serie vuota o sempre in salita → nessun episodio", () => {
    expect(drawdownEpisodes([], "1000")).toEqual([]);
    expect(drawdownEpisodes(serie([10, 20, 0, 5]), "1000")).toEqual([]);
  });
});

function ep(duration: number, recovery: number, depthPct: string | null = "0.05"): DrawdownEpisode {
  return {
    peakDay: "2026-01-01",
    troughDay: "2026-01-02",
    recoveryDay: "2026-01-03",
    depth: "100.00",
    depthPct,
    durationSessions: duration,
    declineSessions: duration - recovery,
    recoverySessions: recovery,
  };
}

describe("drawdownDurationSummary", () => {
  it("sotto campione: niente mediana, ma il più lungo osservato resta un fatto", () => {
    const s = drawdownDurationSummary([ep(3, 1), ep(12, 8)]);
    expect(s.lowSample).toBe(true);
    expect(s.duration.median).toBeNull();
    expect(s.recovery.median).toBeNull();
    expect(s.duration.worst).toBe(12);
    expect(s.recovery.worst).toBe(8);
  });

  it("a campione pieno: mediana e fasce su TUTTI gli episodi chiusi", () => {
    const eps = Array.from({ length: DRAWDOWN_EPISODES_MIN }, (_, i) => ep(i + 2, 1));
    const s = drawdownDurationSummary(eps);
    expect(s.lowSample).toBe(false);
    expect(s.duration.median).toBe("11.5"); // durate 2..21, pari → media dei centrali
    expect(s.duration.worst).toBe(21);
    const tot = s.bands.reduce((a, b) => a + b.duration, 0);
    expect(tot).toBe(DRAWDOWN_EPISODES_MIN);
    expect(s.bands.find((b) => b.key === "1-2")!.duration).toBe(1);
    expect(s.bands.find((b) => b.key === "21-40")!.duration).toBe(1);
    expect(s.bands.find((b) => b.key === "1-2")!.recovery).toBe(DRAWDOWN_EPISODES_MIN);
  });

  it("le fasce coprono ogni durata senza buchi né sovrapposizioni", () => {
    for (let d = 1; d <= 500; d++) {
      expect(DRAWDOWN_BANDS.filter((b) => d >= b.min && d <= b.max)).toHaveLength(1);
    }
  });

  it("l'episodio aperto sta fuori dalle statistiche", () => {
    const aperto = { ...ep(90, 40), recoveryDay: null };
    const s = drawdownDurationSummary([ep(3, 1), aperto]);
    expect(s.closed).toHaveLength(1);
    expect(s.open).toBe(aperto);
    expect(s.duration.worst).toBe(3);
  });

  it("soglia di profondità: esclude i poco profondi e li conta", () => {
    const s = drawdownDurationSummary([ep(2, 1, "0.004"), ep(9, 4, "0.02"), ep(30, 20, null)], "0.01");
    expect(s.closed.map((e) => e.durationSessions)).toEqual([9, 30]);
    expect(s.belowDepth).toBe(1);
  });

  it("zero episodi: tutto vuoto, nessuna divisione", () => {
    const s = drawdownDurationSummary([]);
    expect(s.closed).toEqual([]);
    expect(s.open).toBeNull();
    expect(s.duration).toEqual({ median: null, worst: null });
    expect(s.bands.every((b) => b.duration === 0 && b.recovery === 0)).toBe(true);
  });
});
