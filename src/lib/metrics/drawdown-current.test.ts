import { describe, expect, it } from "vitest";
import {
  currentEpisodePosition,
  DRAWDOWN_EPISODES_MIN,
  type DrawdownEpisode,
} from "./drawdown-episodes";

function chiuso(durata: number, depthPct: string | null = "0.02"): DrawdownEpisode {
  return {
    peakDay: "2026-01-01",
    troughDay: "2026-01-02",
    recoveryDay: "2026-01-05",
    depth: "100.00",
    depthPct,
    durationSessions: durata,
    declineSessions: 1,
    recoverySessions: durata - 1,
  };
}

function aperto(durata: number, depthPct: string | null = "0.03"): DrawdownEpisode {
  return { ...chiuso(durata, depthPct), recoveryDay: null };
}

/** 20 episodi chiusi di durata 1..20 e profondità 0,1%..2,0%. */
const venti = Array.from({ length: DRAWDOWN_EPISODES_MIN }, (_, i) =>
  chiuso(i + 1, ((i + 1) / 1000).toFixed(4)),
);

describe("currentEpisodePosition — l'episodio in corso contro i chiusi", () => {
  it("nessun episodio in corso → null", () => {
    expect(currentEpisodePosition({ closed: venti, open: null })).toBeNull();
  });

  it("quota delle durate strettamente più corte: 17 sedute supera 16 episodi su 20", () => {
    const p = currentEpisodePosition({ closed: venti, open: aperto(17, "0.0105") })!;
    expect(p.lowSample).toBe(false);
    expect(p.closedCount).toBe(20);
    expect(p.durationShare).toBe("0.8000");
    // profondità 1,05%: più profonda dei 10 chiusi da 0,1% a 1,0%
    expect(p.depthShare).toBe("0.5000");
    expect(p.longerThanAll).toBe(false);
  });

  it("a pari durata non si è «più lunghi»", () => {
    const p = currentEpisodePosition({ closed: venti, open: aperto(1) })!;
    expect(p.durationShare).toBe("0.0000");
  });

  it("più lungo di tutti i chiusi: lo dice, con il più lungo chiuso", () => {
    const p = currentEpisodePosition({ closed: venti, open: aperto(40) })!;
    expect(p.durationShare).toBe("1.0000");
    expect(p.longerThanAll).toBe(true);
    expect(p.longestClosed).toBe(20);
  });

  it("sotto 20 episodi chiusi: nessuna quota, il campione è dichiarato", () => {
    const p = currentEpisodePosition({ closed: venti.slice(0, 19), open: aperto(30) })!;
    expect(p.lowSample).toBe(true);
    expect(p.closedCount).toBe(19);
    expect(p.durationShare).toBeNull();
    expect(p.depthShare).toBeNull();
    // il fatto resta: la durata in corso e il chiuso più lungo
    expect(p.episode.durationSessions).toBe(30);
    expect(p.longestClosed).toBe(19);
  });

  it("zero episodi chiusi: il fatto senza confronto, nessuna divisione per zero", () => {
    const p = currentEpisodePosition({ closed: [], open: aperto(3) })!;
    expect(p.lowSample).toBe(true);
    expect(p.longestClosed).toBeNull();
    expect(p.longerThanAll).toBe(false);
  });

  it("profondità in % non definita (massimo ≤ 0): durata sì, profondità no", () => {
    const p = currentEpisodePosition({ closed: venti, open: aperto(5, null) })!;
    expect(p.durationShare).toBe("0.2000");
    expect(p.depthShare).toBeNull();
  });

  it("l'episodio in corso non entra mai nei conteggi dei chiusi", () => {
    const corrente = aperto(10);
    const p = currentEpisodePosition({ closed: venti, open: corrente })!;
    expect(p.closedCount).toBe(20);
    expect(venti).not.toContain(corrente);
  });
});
